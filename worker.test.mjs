import test from 'node:test';
import assert from 'node:assert/strict';
import { HomeRegistry } from '../src/worker.js';

class MemoryStorage {
  constructor() { this.data = new Map(); }
  async get(key) { return this.data.get(key); }
  async put(key, value) {
    if (typeof key === 'object' && key !== null) {
      Object.entries(key).forEach(([entryKey, entryValue]) => this.data.set(entryKey, entryValue));
      return;
    }
    this.data.set(key, value);
  }
  async delete(key) { this.data.delete(key); }
}

function jsonRequest(path, body, headers = {}) {
  return new Request(`https://casa.test${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://casa.test', ...headers },
    body: JSON.stringify(body)
  });
}

async function pushSubscription(endpoint) {
  const receiverKeys = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );
  const receiverPublicKey = new Uint8Array(await crypto.subtle.exportKey('raw', receiverKeys.publicKey));
  const authSecret = crypto.getRandomValues(new Uint8Array(16));
  return {
    endpoint,
    expirationTime: null,
    keys: {
      p256dh: Buffer.from(receiverPublicKey).toString('base64url'),
      auth: Buffer.from(authSecret).toString('base64url')
    }
  };
}

test('crea el hogar, protege la URL y reutiliza sus secretos', async () => {
  const storage = new MemoryStorage();
  const registry = new HomeRegistry({ storage }, {});

  const firstConfig = await registry.fetch(new Request('https://casa.test/api/config'));
  const firstConfigBody = await firstConfig.json();
  assert.equal(firstConfig.status, 200);
  assert.equal(firstConfigBody.claimed, false);
  assert.equal(typeof firstConfigBody.vapidPublicKey, 'string');
  assert.equal('appUrl' in firstConfigBody, false);

  const firstRegistration = await registry.fetch(jsonRequest('/api/register', {
    actor: 'Axel',
    ownerRole: 'person1',
    pin: '654321',
    appUrl: 'https://script.google.com/macros/s/ABC123/exec',
    subscription: null
  }));
  const firstDevice = await firstRegistration.json();
  assert.equal(firstRegistration.status, 200);
  assert.equal(firstDevice.claimedNow, true);
  assert.match(firstDevice.notifyUrl, /\/api\/notify$/);
  assert.ok(firstDevice.bridgeSecret.length >= 32);
  assert.ok(firstDevice.appAccessToken.length >= 32);
  assert.notEqual(storage.data.get('pinHash'), '654321');

  const axelSubscription = await pushSubscription('https://push.example.test/send/axel');
  const activatedFirstDevice = await registry.fetch(jsonRequest('/api/register', {
    actor: 'Axel',
    ownerRole: 'person1',
    deviceId: firstDevice.deviceId,
    deviceSecret: firstDevice.deviceSecret,
    subscription: axelSubscription
  }));
  assert.equal(activatedFirstDevice.status, 200);

  const publicConfig = await registry.fetch(new Request('https://casa.test/api/config'));
  const publicConfigBody = await publicConfig.json();
  assert.equal(publicConfigBody.claimed, true);
  assert.equal(publicConfigBody.hasAppUrl, true);
  assert.equal('appUrl' in publicConfigBody, false);

  const wrongPin = await registry.fetch(jsonRequest('/api/register', {
    actor: 'Laura', pin: '000000', subscription: null
  }, { 'CF-Connecting-IP': '203.0.113.8' }));
  assert.equal(wrongPin.status, 401);

  const secondRegistration = await registry.fetch(jsonRequest('/api/register', {
    actor: 'Laura', ownerRole: 'person2', pin: '654321', subscription: null
  }, { 'CF-Connecting-IP': '203.0.113.8' }));
  const secondDevice = await secondRegistration.json();
  assert.equal(secondRegistration.status, 200);
  assert.equal(secondDevice.appUrl, 'https://script.google.com/macros/s/ABC123/exec');
  assert.equal(secondDevice.appAccessToken, firstDevice.appAccessToken);

  const legacyLauraRegistration = await registry.fetch(jsonRequest('/api/register', {
    actor: 'Laura', pin: '654321', subscription: null
  }, { 'CF-Connecting-IP': '203.0.113.9' }));
  const legacyLauraDevice = await legacyLauraRegistration.json();
  assert.equal(legacyLauraDevice.ownerRole, 'person2');

  const lauraSubscription = await pushSubscription('https://push.example.test/send/laura');
  const activatedSecondDevice = await registry.fetch(jsonRequest('/api/register', {
    actor: 'Laura',
    ownerRole: 'person2',
    deviceId: secondDevice.deviceId,
    deviceSecret: secondDevice.deviceSecret,
    subscription: lauraSubscription
  }));
  assert.equal(activatedSecondDevice.status, 200);

  const bridgeCheck = await registry.fetch(new Request('https://casa.test/api/bridge-status', {
    headers: { Authorization: `Bearer ${firstDevice.bridgeSecret}` }
  }));
  assert.equal(bridgeCheck.status, 200);

  const originalFetch = globalThis.fetch;
  const outgoingRequests = [];
  globalThis.fetch = async (url, options) => {
    outgoingRequests.push({ url: String(url), options });
    return new Response('', { status: 201 });
  };
  try {
    const notification = await registry.fetch(jsonRequest('/api/notify', {
      actor: 'Axel', actorRole: 'person1', title: 'Axel agregó: Leche', body: 'Despensa', itemId: 'HOG-1'
    }, { Authorization: `Bearer ${firstDevice.bridgeSecret}`, Origin: '' }));
    const notificationBody = await notification.json();
    assert.equal(notification.status, 200);
    assert.equal(notificationBody.sent, 1);
    assert.equal(outgoingRequests.at(-1).url, lauraSubscription.endpoint);
    assert.equal(outgoingRequests.at(-1).options.headers['Content-Encoding'], 'aes128gcm');
    assert.match(outgoingRequests.at(-1).options.headers.Authorization, /^vapid /i);

    const reverseNotification = await registry.fetch(jsonRequest('/api/notify', {
      actor: 'Laura', actorRole: 'person2', title: 'Laura agregó: Foco', body: 'Reparación', itemId: 'HOG-REV'
    }, { Authorization: `Bearer ${firstDevice.bridgeSecret}`, Origin: '' }));
    const reverseBody = await reverseNotification.json();
    assert.equal(reverseBody.sent, 1);
    assert.equal(outgoingRequests.at(-1).url, axelSubscription.endpoint);

    const samePhone = await registry.fetch(jsonRequest('/api/notify', {
      actor: 'Axel', actorRole: 'person1', originDeviceId: secondDevice.deviceId,
      title: 'Axel agregó desde el teléfono de Laura', body: 'Otro', itemId: 'HOG-2'
    }, { Authorization: `Bearer ${firstDevice.bridgeSecret}`, Origin: '' }));
    const samePhoneBody = await samePhone.json();
    assert.equal(samePhoneBody.sent, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
