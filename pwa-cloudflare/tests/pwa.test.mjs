import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const publicRoot = `${root}public/`;

test('el manifiesto identifica una PWA independiente e instalable', () => {
  const manifest = JSON.parse(readFileSync(`${publicRoot}manifest.webmanifest`, 'utf8'));
  // El id se conserva para que Android actualice la instalación 3.0 en vez de crear otra app.
  assert.equal(manifest.id, '/casa-en-orden-v3');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.shortcuts.some(shortcut => shortcut.url === '/?modo=nfc'));
  assert.ok(manifest.icons.some(icon => String(icon.purpose).includes('maskable')));
  manifest.icons.forEach(icon => assert.equal(existsSync(`${publicRoot}${icon.src.replace(/^\//, '')}`), true));
});

test('todos los archivos precargados por el service worker existen', () => {
  const source = readFileSync(`${publicRoot}sw.js`, 'utf8');
  const shell = source.match(/const APP_SHELL = \[([\s\S]*?)\];/)[1];
  const paths = [...shell.matchAll(/'([^']+)'/g)].map(match => match[1]);
  assert.ok(paths.length >= 8);
  paths.filter(path => path !== '/').forEach(path => {
    assert.equal(existsSync(`${publicRoot}${path.replace(/^\//, '')}`), true, `Falta ${path}`);
  });
});

test('la página carga el manifiesto, el service worker y una política de contenido', () => {
  const html = readFileSync(`${publicRoot}index.html`, 'utf8');
  const app = readFileSync(`${publicRoot}app.js`, 'utf8');
  assert.match(html, /rel="manifest"/);
  assert.match(html, /Content-Security-Policy/);
  assert.match(app, /registerServiceWorker/);
  assert.match(app, /configure-push-bridge/);
});

test('el acceso NFC usa la identidad fija del teléfono y ofrece el alta rápida', () => {
  const html = readFileSync(`${publicRoot}index.html`, 'utf8');
  const app = readFileSync(`${publicRoot}app.js`, 'utf8');
  assert.match(html, /id="quickView"/);
  assert.match(html, /Agregar pendiente/);
  assert.match(html, /Este cambio será temporal/);
  assert.match(app, /ownerRole/);
  assert.match(app, /LAUNCH_PARAMS\.get\('modo'\) === 'nfc'/);
  assert.match(app, /casa-en-orden:open-new-item/);
});

test('la sincronización es por eventos y no por temporizador periódico', () => {
  const app = readFileSync(`${publicRoot}app.js`, 'utf8');
  const serviceWorker = readFileSync(`${publicRoot}sw.js`, 'utf8');
  assert.doesNotMatch(app, /setInterval\s*\(/);
  assert.match(serviceWorker, /casa-en-orden:data-changed/);
  assert.match(app, /casa-en-orden:refresh/);
});
