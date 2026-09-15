const encoder = new TextEncoder();

export class ApiError extends Error {
  constructor(status, message, code = 'REQUEST_ERROR') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export function normalizeActor(value) {
  const actor = String(value || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!actor) throw new ApiError(400, 'Elige quién está usando este teléfono.', 'ACTOR_REQUIRED');
  return actor;
}

export function normalizePin(value) {
  const pin = String(value || '').trim();
  if (pin.length < 6 || pin.length > 64) {
    throw new ApiError(400, 'El PIN debe tener entre 6 y 64 caracteres.', 'PIN_INVALID');
  }
  return pin;
}

export function validateAppsScriptUrl(value) {
  let url;
  try {
    url = new URL(String(value || '').trim());
  } catch {
    throw new ApiError(400, 'Pega una URL válida de la implementación de Apps Script.', 'APP_URL_INVALID');
  }

  const allowedHosts = new Set(['script.google.com', 'script.googleusercontent.com']);
  const isGoogleusercontentSubdomain = url.hostname.endsWith('.googleusercontent.com');
  if (url.protocol !== 'https:' || (!allowedHosts.has(url.hostname) && !isGoogleusercontentSubdomain)) {
    throw new ApiError(400, 'La URL debe pertenecer a una Web App de Google Apps Script.', 'APP_URL_INVALID');
  }
  if (url.hostname === 'script.google.com' && !/^\/macros\/s\/[^/]+\/(exec|dev)$/.test(url.pathname)) {
    throw new ApiError(400, 'Usa la URL que termina en /exec de tu implementación de Apps Script.', 'APP_URL_INVALID');
  }
  url.hash = '';
  return url.toString();
}

export function normalizeSubscription(value, { optional = false } = {}) {
  if (!value && optional) return null;
  if (!value || typeof value !== 'object') {
    throw new ApiError(400, 'No se recibió la suscripción de notificaciones.', 'SUBSCRIPTION_REQUIRED');
  }

  let endpoint;
  try {
    endpoint = new URL(String(value.endpoint || ''));
  } catch {
    throw new ApiError(400, 'La suscripción de notificaciones no es válida.', 'SUBSCRIPTION_INVALID');
  }
  const keys = value.keys || {};
  if (endpoint.protocol !== 'https:' || !keys.p256dh || !keys.auth) {
    throw new ApiError(400, 'La suscripción de notificaciones está incompleta.', 'SUBSCRIPTION_INVALID');
  }
  if (endpoint.toString().length > 2048 || String(keys.p256dh).length > 512 || String(keys.auth).length > 256) {
    throw new ApiError(400, 'La suscripción de notificaciones es demasiado grande.', 'SUBSCRIPTION_INVALID');
  }

  return {
    endpoint: endpoint.toString(),
    expirationTime: value.expirationTime || null,
    keys: {
      p256dh: String(keys.p256dh),
      auth: String(keys.auth)
    }
  };
}

export function cleanNotification(value) {
  const source = value && typeof value === 'object' ? value : {};
  const title = cleanText(source.title, 100) || 'Casa en Orden';
  const body = cleanText(source.body || source.message, 280) || 'Hay un cambio nuevo en el hogar.';
  const actor = cleanText(source.actor, 80) || 'Alguien';
  const itemId = cleanText(source.itemId, 80);
  const priority = cleanText(source.priority, 20);
  return { title, body, actor, itemId, priority };
}

export function cleanText(value, limit = 200) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
}

export function safeEqual(left, right) {
  const a = String(left || '');
  const b = String(right || '');
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}

export async function hashSecret(secret, salt) {
  const bytes = encoder.encode(`${salt}\u0000${secret}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return toBase64Url(new Uint8Array(digest));
}

export function randomToken(bytes = 32) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return toBase64Url(data);
}

export function toBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function notificationTopic(itemId) {
  const value = String(itemId || 'casa-en-orden').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);
  return value || 'casa-en-orden';
}
