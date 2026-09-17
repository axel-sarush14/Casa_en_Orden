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

test('la pantalla y el JavaScript abren desde la copia instalada y se actualizan detrás', () => {
  const source = readFileSync(`${publicRoot}sw.js`, 'utf8');
  assert.match(source, /\['\/app\.js', '\/app\.css', '\/manifest\.webmanifest'\]\.includes\(url\.pathname\)/);
  assert.match(source, /request\.mode === 'navigate'[\s\S]*?caches\.match\('\/index\.html'\)/);
  assert.match(source, /includes\(url\.pathname\)[\s\S]*?caches\.match\(request, \{ ignoreSearch: true \}\)/);
  assert.match(source, /event\.waitUntil\(fresh\.catch/);
});

test('la página carga el manifiesto, el service worker y una política de contenido', () => {
  const html = readFileSync(`${publicRoot}index.html`, 'utf8');
  const app = readFileSync(`${publicRoot}app.js`, 'utf8');
  assert.match(html, /rel="manifest"/);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /\/app\.js\?v=5\.1\.0/);
  assert.match(html, /\/app\.css\?v=5\.1\.0/);
  assert.match(app, /registerServiceWorker/);
  assert.match(app, /configure-push-bridge/);
});

test('la PWA ya no depende de Workers AI para las imágenes', () => {
  const app = readFileSync(`${publicRoot}app.js`, 'utf8');
  const worker = readFileSync(`${root}src/worker.js`, 'utf8');
  const wrangler = readFileSync(`${root}wrangler.jsonc`, 'utf8');
  assert.doesNotMatch(app, /generate-product-image/);
  assert.doesNotMatch(app, /\/api\/catalog-image/);
  assert.doesNotMatch(worker, /Workers AI|AI_DAILY_LIMIT|flux-1-schnell/);
  assert.doesNotMatch(wrangler, /"ai"\s*:/);
});

test('la PWA entrega una conexión alternativa dentro del fragmento del iframe', () => {
  const app = readFileSync(`${publicRoot}app.js`, 'utf8');
  assert.match(app, /fragment\.set\('ceBridge', JSON\.stringify\(bootstrap\)\)/);
  assert.match(app, /notifySecret: state\.bridge\?\.notifySecret/);
  assert.match(app, /target\.hash = fragment\.toString\(\)/);
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
  assert.match(app, /primeCachedSession\(\)/);
  assert.ok(app.indexOf('if (state.quickMode && state.device) showQuickView()') < app.indexOf("api('/api/config')"));
  assert.match(app, /Promise\.all\(\[\s*api\('\/api\/config'\),\s*state\.device \? restoreDevice\(\)/);
  assert.match(app, /data\.type === 'casa-en-orden:shell-ready'[\s\S]*?dispatchPendingFrameAction\(\)/);
  assert.match(app, /people: state\.config\?\.people \|\| \[\]/);
});

test('las llamadas de Cloudflare tienen un límite y nunca dejan el acceso rápido esperando indefinidamente', () => {
  const app = readFileSync(`${publicRoot}app.js`, 'utf8');
  assert.match(app, /const controller = new AbortController\(\)/);
  assert.match(app, /controller\.abort\(\)/);
  assert.match(app, /La conexión está tardando demasiado/);
});

test('la sincronización es por eventos y no por temporizador periódico', () => {
  const app = readFileSync(`${publicRoot}app.js`, 'utf8');
  const serviceWorker = readFileSync(`${publicRoot}sw.js`, 'utf8');
  assert.doesNotMatch(app, /setInterval\s*\(/);
  assert.match(serviceWorker, /casa-en-orden:data-changed/);
  assert.match(app, /casa-en-orden:refresh/);
});
