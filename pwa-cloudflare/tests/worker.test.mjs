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
    actor: 'Laura', pin: '654321', subscription: null
  }, { 'CF-Connecting-IP': '203.0.113.8' }));
  const secondDevice = await secondRegistration.json();
  assert.equal(secondRegistration.status, 200);
  assert.equal(secondDevice.appUrl, 'https://script.google.com/macros/s/ABC123/exec');
  assert.equal(secondDevice.appAccessToken, firstDevice.appAccessToken);

  const receiverKeys = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );
  const receiverPublicKey = new Uint8Array(await crypto.subtle.exportKey('raw', receiverKeys.publicKey));
  const authSecret = crypto.getRandomValues(new Uint8Array(16));
  const pushSubscription = {
    endpoint: 'https://push.example.test/send/laura',
    expirationTime: null,
    keys: {
      p256dh: Buffer.from(receiverPublicKey).toString('base64url'),
      auth: Buffer.from(authSecret).toString('base64url')
    }
  };
  const activatedSecondDevice = await registry.fetch(jsonRequest('/api/register', {
    actor: 'Laura',
    deviceId: secondDevice.deviceId,
    deviceSecret: secondDevice.deviceSecret,
    subscription: pushSubscription
  }));
  assert.equal(activatedSecondDevice.status, 200);

  const bridgeCheck = await registry.fetch(new Request('https://casa.test/api/bridge-status', {
    headers: { Authorization: `Bearer ${firstDevice.bridgeSecret}` }
  }));
  assert.equal(bridgeCheck.status, 200);

  const originalFetch = globalThis.fetch;
  let outgoingRequest;
  globalThis.fetch = async (url, options) => {
    outgoingRequest = { url: String(url), options };
    return new Response('', { status: 201 });
  };
  try {
    const notification = await registry.fetch(jsonRequest('/api/notify', {
      actor: 'Axel', title: 'Axel agregó: Leche', body: 'Despensa', itemId: 'HOG-1'
    }, { Authorization: `Bearer ${firstDevice.bridgeSecret}`, Origin: '' }));
    const notificationBody = await notification.json();
    assert.equal(notification.status, 200);
    assert.equal(notificationBody.sent, 1);
    assert.equal(outgoingRequest.url, pushSubscription.endpoint);
    assert.equal(outgoingRequest.options.headers['Content-Encoding'], 'aes128gcm');
    assert.match(outgoingRequest.options.headers.Authorization, /^vapid /i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
