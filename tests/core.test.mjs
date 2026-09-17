import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ApiError,
  cleanNotification,
  hashSecret,
  normalizeActor,
  normalizeOwnerRole,
  normalizePin,
  normalizeSubscription,
  notificationTopic,
  safeEqual,
  validateAppsScriptUrl
} from '../src/core.js';

test('acepta una URL de implementación de Apps Script', () => {
  assert.equal(
    validateAppsScriptUrl('https://script.google.com/macros/s/ABC123/exec'),
    'https://script.google.com/macros/s/ABC123/exec'
  );
});

test('rechaza URLs externas o de edición', () => {
  assert.throws(() => validateAppsScriptUrl('https://example.com/app'), ApiError);
  assert.throws(() => validateAppsScriptUrl('https://script.google.com/home/projects/ABC/edit'), ApiError);
});

test('normaliza actores y valida el PIN', () => {
  assert.equal(normalizeActor('  Laura   Gómez '), 'Laura Gómez');
  assert.equal(normalizePin(' 123456 '), '123456');
  assert.throws(() => normalizePin('123'), /PIN/);
  assert.equal(normalizeOwnerRole('person2'), 'person2');
  assert.equal(normalizeOwnerRole('desconocido'), 'person1');
});

test('valida el formato estándar de PushSubscription', () => {
  const subscription = normalizeSubscription({
    endpoint: 'https://push.example.test/send/123',
    expirationTime: null,
    keys: { p256dh: 'publica', auth: 'secreto' }
  });
  assert.equal(subscription.endpoint, 'https://push.example.test/send/123');
  assert.equal(subscription.keys.auth, 'secreto');
  assert.equal(normalizeSubscription(null, { optional: true }), null);
});

test('el hash es estable y la comparación detecta diferencias', async () => {
  const first = await hashSecret('mi-pin', 'sal');
  const second = await hashSecret('mi-pin', 'sal');
  const other = await hashSecret('otro-pin', 'sal');
  assert.equal(first, second);
  assert.equal(safeEqual(first, second), true);
  assert.equal(safeEqual(first, other), false);
});

test('limpia el contenido y crea temas válidos para Web Push', () => {
  const notification = cleanNotification({ title: '  Luz\n', message: ' Pagada\t ', actor: 'Axel', actorRole: 'person1', originDeviceId: ' telefono-1 ' });
  assert.equal(notification.title, 'Luz');
  assert.equal(notification.body, 'Pagada');
  assert.equal(notification.actorRole, 'person1');
  assert.equal(notification.originDeviceId, 'telefono-1');
  assert.equal(notificationTopic('HOG 12/3'), 'HOG123');
});
