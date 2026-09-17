import { generateVAPIDKeys, sendNotification } from 'web-push-neo';
import {
  ApiError,
  cleanNotification,
  hashSecret,
  normalizeActor,
  normalizeOwnerRole,
  normalizePin,
  normalizeSubscription,
  notificationTopic,
  randomToken,
  safeEqual,
  validateAppsScriptUrl
} from './core.js';

const HOME_OBJECT_NAME = 'casa-en-orden-v3';
const MAX_DEVICES = 12;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      const id = env.HOME_REGISTRY.idFromName(HOME_OBJECT_NAME);
      return env.HOME_REGISTRY.get(id).fetch(request);
    }
    return env.ASSETS.fetch(request);
  }
};

export class HomeRegistry {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    try {
      const url = new URL(request.url);
      if (request.method === 'GET' && url.pathname === '/api/config') return await this.config(request);
      if (request.method === 'GET' && url.pathname === '/api/health') return await this.health();
      if (request.method === 'GET' && url.pathname === '/api/bridge-status') return await this.bridgeStatus(request);
      if (request.method === 'POST' && url.pathname === '/api/register') return await this.register(request);
      if (request.method === 'POST' && url.pathname === '/api/notify') return await this.notify(request);
      if (request.method === 'POST' && url.pathname === '/api/test') return await this.testNotification(request);
      return json({ ok: false, error: 'Ruta no encontrada.', code: 'NOT_FOUND' }, 404);
    } catch (error) {
      if (error instanceof ApiError) {
        return json({ ok: false, error: error.message, code: error.code }, error.status);
      }
      console.error(error);
      return json({ ok: false, error: 'Ocurrió un error temporal en el servicio de notificaciones.', code: 'SERVER_ERROR' }, 500);
    }
  }

  async health() {
    const claimed = Boolean(await this.ctx.storage.get('pinHash'));
    const devices = (await this.ctx.storage.get('devices')) || {};
    return json({ ok: true, claimed, devices: Object.keys(devices).length, version: '4.3.3' });
  }

  async config() {
    const vapid = await this.ensureVapid();
    const [pinHash, appUrl, devices] = await Promise.all([
      this.ctx.storage.get('pinHash'),
      this.ctx.storage.get('appUrl'),
      this.ctx.storage.get('devices')
    ]);
    return json({
      ok: true,
      claimed: Boolean(pinHash),
      hasAppUrl: Boolean(appUrl),
      vapidPublicKey: vapid.publicKey,
      people: publicPeople(devices || {}),
      version: '4.3.3'
    });
  }

  async register(request) {
    assertSameOrigin(request);
    const body = await readJson(request);
    const actor = normalizeActor(body.actor);
    const devices = (await this.ctx.storage.get('devices')) || {};
    const knownDevice = authenticateDevice(devices, body.deviceId, body.deviceSecret);
    const subscriptionWasSent = Object.prototype.hasOwnProperty.call(body, 'subscription');
    const subscription = subscriptionWasSent
      ? normalizeSubscription(body.subscription, { optional: true })
      : knownDevice?.subscription || null;
    const ownerRole = body.ownerRole
      ? normalizeOwnerRole(body.ownerRole)
      : knownDevice?.ownerRole || inferOwnerRole(actor);
    const pinHash = await this.ctx.storage.get('pinHash');

    let claimedNow = false;
    if (!pinHash) {
      const pin = normalizePin(body.pin);
      const appUrl = validateAppsScriptUrl(body.appUrl);
      const salt = randomToken(18);
      const nextHash = await hashSecret(pin, salt);
      const bridgeSecret = randomToken(36);
      await this.ctx.storage.put({ pinSalt: salt, pinHash: nextHash, appUrl, bridgeSecret });
      claimedNow = true;
    } else if (!knownDevice) {
      await this.requirePin(request, body.pin);
    }

    let deviceId = knownDevice ? String(body.deviceId) : crypto.randomUUID();
    let deviceSecret = knownDevice ? String(body.deviceSecret) : randomToken(32);
    if (!knownDevice && Object.keys(devices).length >= MAX_DEVICES) {
      const removable = Object.entries(devices)
        .filter(([, device]) => !device.subscription)
        .sort((a, b) => Number(a[1].updatedAt || 0) - Number(b[1].updatedAt || 0));
      if (removable[0]) delete devices[removable[0][0]];
      else throw new ApiError(409, 'Ya hay demasiados teléfonos vinculados a este hogar.', 'DEVICE_LIMIT');
    }

    devices[deviceId] = {
      actor,
      ownerRole,
      deviceSecret,
      subscription,
      createdAt: knownDevice && devices[deviceId].createdAt ? devices[deviceId].createdAt : Date.now(),
      updatedAt: Date.now()
    };
    await this.ctx.storage.put('devices', devices);

    const [bridgeSecret, appAccessToken, appUrl] = await Promise.all([
      this.ensureBridgeSecret(),
      this.ensureAppAccessToken(),
      this.ctx.storage.get('appUrl')
    ]);
    const origin = new URL(request.url).origin;
    return json({
      ok: true,
      claimedNow,
      deviceId,
      deviceSecret,
      actor,
      ownerRole,
      appUrl,
      notifyUrl: `${origin}/api/notify`,
      bridgeSecret,
      appAccessToken,
      notificationsActive: Boolean(subscription)
    });
  }

  async bridgeStatus(request) {
    await this.requireBridge(request);
    return json({ ok: true, app: 'casa-en-orden', version: '4.3.3' });
  }

  async notify(request) {
    await this.requireBridge(request);
    const message = cleanNotification(await readJson(request));
    const devices = (await this.ctx.storage.get('devices')) || {};
    const vapid = await this.ensureVapid();
    const recipients = Object.entries(devices).filter(([deviceId, device]) => {
      const samePerson = message.actorRole && device.ownerRole
        ? device.ownerRole === message.actorRole
        : String(device.actor || '').toLocaleLowerCase('es') === message.actor.toLocaleLowerCase('es');
      return device.subscription &&
        deviceId !== message.originDeviceId &&
        !samePerson;
    });

    const payload = JSON.stringify({
      title: message.title,
      body: message.body,
      actor: message.actor,
      itemId: message.itemId,
      url: message.itemId ? `/?item=${encodeURIComponent(message.itemId)}` : '/',
      timestamp: Date.now()
    });
    const origin = new URL(request.url).origin;
    const results = await Promise.allSettled(recipients.map(([, device]) => sendNotification(
      device.subscription,
      payload,
      {
        vapidDetails: {
          subject: origin,
          publicKey: vapid.publicKey,
          privateKey: vapid.privateKey
        },
        TTL: 24 * 60 * 60,
        urgency: message.priority === 'Urgente' ? 'high' : 'normal',
        topic: notificationTopic(message.itemId),
        signal: AbortSignal.timeout(10000)
      }
    )));

    let sent = 0;
    let failed = 0;
    let changed = false;
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        sent += 1;
        return;
      }
      failed += 1;
      const status = Number(result.reason && result.reason.statusCode);
      if (status === 404 || status === 410) {
        delete devices[recipients[index][0]];
        changed = true;
      }
      console.warn('No se pudo enviar una notificación Web Push.', status || result.reason);
    });
    if (changed) await this.ctx.storage.put('devices', devices);
    return json({ ok: true, sent, failed, skipped: Object.keys(devices).length - recipients.length });
  }

  async testNotification(request) {
    assertSameOrigin(request);
    const body = await readJson(request);
    const devices = (await this.ctx.storage.get('devices')) || {};
    const device = authenticateDevice(devices, body.deviceId, body.deviceSecret);
    if (!device || !device.subscription) {
      throw new ApiError(401, 'Este teléfono todavía no tiene notificaciones activas.', 'DEVICE_UNAUTHORIZED');
    }
    const vapid = await this.ensureVapid();
    const origin = new URL(request.url).origin;
    await sendNotification(device.subscription, JSON.stringify({
      title: 'Casa en Orden',
      body: `¡Listo, ${device.actor}! Las notificaciones funcionan en este teléfono.`,
      actor: 'Casa en Orden',
      url: '/',
      timestamp: Date.now()
    }), {
      vapidDetails: { subject: origin, publicKey: vapid.publicKey, privateKey: vapid.privateKey },
      TTL: 300,
      urgency: 'high',
      topic: 'prueba-casa-en-orden',
      signal: AbortSignal.timeout(10000)
    });
    return json({ ok: true });
  }

  async requirePin(request, value) {
    const pin = normalizePin(value);
    const ip = request.headers.get('CF-Connecting-IP') || 'local';
    const ipKey = `attempt:${(await hashSecret(ip, 'casa-en-orden')).slice(0, 20)}`;
    const now = Date.now();
    const attempt = (await this.ctx.storage.get(ipKey)) || { count: 0, startedAt: now, blockedUntil: 0 };
    if (attempt.blockedUntil > now) {
      throw new ApiError(429, 'Espera un minuto antes de intentar otro PIN.', 'PIN_RATE_LIMIT');
    }

    const [salt, storedHash] = await Promise.all([
      this.ctx.storage.get('pinSalt'),
      this.ctx.storage.get('pinHash')
    ]);
    const candidate = await hashSecret(pin, salt || '');
    if (storedHash && safeEqual(candidate, storedHash)) {
      await this.ctx.storage.delete(ipKey);
      return true;
    }

    const insideWindow = now - Number(attempt.startedAt || 0) < 10 * 60 * 1000;
    const count = insideWindow ? Number(attempt.count || 0) + 1 : 1;
    await this.ctx.storage.put(ipKey, {
      count: count >= 5 ? 0 : count,
      startedAt: insideWindow ? attempt.startedAt : now,
      blockedUntil: count >= 5 ? now + 60 * 1000 : 0
    });
    throw new ApiError(401, 'El PIN del hogar no coincide.', 'PIN_INCORRECT');
  }

  async requireBridge(request) {
    const stored = await this.ctx.storage.get('bridgeSecret');
    const authorization = request.headers.get('Authorization') || '';
    const candidate = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!stored || !safeEqual(candidate, stored)) {
      throw new ApiError(401, 'El puente de notificaciones no está autorizado.', 'BRIDGE_UNAUTHORIZED');
    }
  }

  async ensureVapid() {
    let keys = await this.ctx.storage.get('vapid');
    if (!keys) {
      keys = await generateVAPIDKeys();
      await this.ctx.storage.put('vapid', keys);
    }
    return keys;
  }

  async ensureBridgeSecret() {
    let secret = await this.ctx.storage.get('bridgeSecret');
    if (!secret) {
      secret = randomToken(36);
      await this.ctx.storage.put('bridgeSecret', secret);
    }
    return secret;
  }

  async ensureAppAccessToken() {
    let secret = await this.ctx.storage.get('appAccessToken');
    if (!secret) {
      secret = randomToken(36);
      await this.ctx.storage.put('appAccessToken', secret);
    }
    return secret;
  }
}

function publicPeople(devices) {
  const names = { person1: '', person2: '' };
  Object.values(devices).forEach(device => {
    const actor = String(device.actor || '').trim();
    if (!actor) return;
    const role = device.ownerRole || (/^(lau|laura)$/i.test(actor) ? 'person2' : 'person1');
    if (!names[role]) names[role] = actor;
  });
  return [names.person1 || 'Axel', names.person2 || 'Laura'];
}

function inferOwnerRole(actor) {
  return /^(lau|laura)(\s|$)/i.test(String(actor || '').trim()) ? 'person2' : 'person1';
}

function authenticateDevice(devices, deviceId, deviceSecret) {
  const id = String(deviceId || '');
  const secret = String(deviceSecret || '');
  const device = id && devices[id];
  return device && safeEqual(device.deviceSecret, secret) ? device : null;
}

function assertSameOrigin(request) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) {
    throw new ApiError(403, 'Solicitud bloqueada por seguridad.', 'ORIGIN_FORBIDDEN');
  }
}

async function readJson(request) {
  const type = request.headers.get('Content-Type') || '';
  if (!type.toLowerCase().includes('application/json')) {
    throw new ApiError(415, 'La solicitud debe enviarse como JSON.', 'CONTENT_TYPE_INVALID');
  }
  const length = Number(request.headers.get('Content-Length') || 0);
  if (length > 16 * 1024) throw new ApiError(413, 'La solicitud es demasiado grande.', 'PAYLOAD_TOO_LARGE');
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, 'No se pudo leer la solicitud.', 'JSON_INVALID');
  }
}

function json(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer'
    }
  });
}
