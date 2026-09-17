import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const codePath = `${projectRoot}apps-script/Code.gs`;
const scriptsPath = `${projectRoot}apps-script/Scripts.html`;
const indexPath = `${projectRoot}apps-script/Index.html`;
const code = readFileSync(codePath, 'utf8');
const scriptsHtml = readFileSync(scriptsPath, 'utf8');
const indexHtml = readFileSync(indexPath, 'utf8');
const scripts = scriptsHtml.match(/<script>([\s\S]*)<\/script>/)?.[1] || '';

function loadAppsScriptHelpers() {
  const Utilities = {
    formatDate(value) {
      const date = new Date(value);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }
  };
  const Session = { getScriptTimeZone: () => 'UTC' };
  return new Function('Utilities', 'Session', `${code}; return { APP, nextRecurrenceDate_, normalizeCatalogPayload_, publicCatalogEntry_ };`)(Utilities, Session);
}

test('el código de Apps Script y el JavaScript de la interfaz tienen sintaxis válida', () => {
  assert.doesNotThrow(() => new Function(code));
  assert.doesNotThrow(() => new Function(scripts));
});

test('la migración conserva las 18 columnas originales y agrega recurrencia y catálogo', () => {
  const { APP } = loadAppsScriptHelpers();
  assert.deepEqual(APP.ITEM_HEADERS.slice(0, 18), [
    'ID', 'Tipo', 'Titulo', 'Detalle', 'Cantidad', 'Monto',
    'FechaVencimiento', 'Prioridad', 'Responsable', 'CreadoPor',
    'Estado', 'PortalURL', 'ComprobanteURL', 'ComprobanteNombre',
    'FechaCreacion', 'FechaActualizacion', 'CompletadoPor', 'FechaCompletado'
  ]);
  assert.ok(APP.ITEM_HEADERS.includes('ServicioModalidad'));
  assert.ok(APP.ITEM_HEADERS.includes('AnteriorID'));
  assert.equal(APP.SHEETS.CATALOG, 'Catalogo');
  assert.match(code, /function saveCatalogEntry/);
});

test('las fechas recurrentes respetan fin de mes y frecuencias personalizadas', () => {
  const { nextRecurrenceDate_ } = loadAppsScriptHelpers();
  assert.equal(nextRecurrenceDate_('2025-01-31', 'Mensual', ''), '2025-02-28');
  assert.equal(nextRecurrenceDate_('2024-02-29', 'Anual', ''), '2025-02-28');
  assert.equal(nextRecurrenceDate_('2025-01-15', 'Bimestral', ''), '2025-03-15');
  assert.equal(nextRecurrenceDate_('2025-01-01', 'Personalizada', 45), '2025-02-15');
});

test('el catálogo unifica registros antiguos en una sola descripción', () => {
  const { normalizeCatalogPayload_, publicCatalogEntry_ } = loadAppsScriptHelpers();
  const legacy = publicCatalogEntry_({
    alias: 'Lámpara cocina', name: 'Lámpara LED', brand: 'Marca X', model: 'A20',
    specification: '20 W · luz blanca', presentation: '1 pieza', location: 'Cocina'
  });
  assert.equal(legacy.description, 'Lámpara LED · Marca X · A20 · 20 W · luz blanca · 1 pieza · Ubicación: Cocina');
  const simple = normalizeCatalogPayload_({ alias: 'Filtro de agua', description: 'Modelo ABC · 2 piezas' });
  assert.equal(simple.alias, 'Filtro de agua');
  assert.equal(simple.description, 'Modelo ABC · 2 piezas');
});

test('la búsqueda usa un solo catálogo sin depender de la categoría del pendiente', () => {
  assert.match(indexHtml, /Nombre del producto/);
  assert.match(indexHtml, /Descripción o referencia/);
  assert.doesNotMatch(indexHtml, /id="catalogCategory"/);
  assert.doesNotMatch(indexHtml, /id="catalogBrand"/);
  assert.doesNotMatch(indexHtml, /id="catalogModel"/);
  assert.doesNotMatch(scripts, /entry\.category === type/);
  assert.doesNotMatch(scripts, /setRadio\('type', entry\.category\)/);
  assert.match(scripts, /catalogSearchScore/);
});

test('el catálogo permite tomar o elegir una foto y la guarda en Drive', () => {
  assert.match(indexHtml, /id="catalogImageFile"[^>]+type="file"[^>]+accept="image\/\*"/);
  assert.doesNotMatch(indexHtml.match(/<input id="catalogImageFile"[^>]*>/)?.[0] || '', /\bcapture=/);
  assert.match(indexHtml, /Tomar o elegir foto/);
  assert.doesNotMatch(indexHtml, /URL de imagen/);
  assert.match(scripts, /prepareCatalogImage/);
  assert.match(scripts, /uploadCatalogImage/);
  assert.match(code, /function uploadCatalogImage/);
  assert.match(code, /CATALOG_IMAGE_FOLDER_ID/);
  assert.match(code, /DriveApp\.Access\.ANYONE_WITH_LINK/);
});

test('el catálogo del nuevo pendiente permanece contraído hasta escribir una búsqueda', () => {
  const start = scripts.indexOf('function renderCatalogSuggestions()');
  const end = scripts.indexOf('function handleCatalogSuggestion', start);
  const renderer = scripts.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(renderer, /const query = normalizeText\(els\.catalogSearch\.value\);/);
  assert.match(renderer, /if \(!query\) \{[\s\S]*?catalogSuggestions\.hidden = true;[\s\S]*?catalogSuggestions\.innerHTML = '';[\s\S]*?return;/);
  assert.match(renderer, /\.slice\(0, 7\)/);
});

test('un pendiente permite tomar una foto y la muestra como producto sin alterar comprobantes de servicios', () => {
  const itemFile = indexHtml.match(/<input id="itemFile"[^>]*>/)?.[0] || '';
  assert.match(itemFile, /type="file"/);
  assert.match(itemFile, /accept="image\/\*"/);
  assert.doesNotMatch(itemFile, /\bcapture=/);
  assert.match(indexHtml, /id="itemAttachmentPreview"/);
  assert.match(indexHtml, /Tomar o elegir foto/);
  assert.doesNotMatch(indexHtml, /Agregar foto o comprobante/);
  assert.match(scripts, /handleItemAttachmentSelection/);
  assert.match(scripts, /itemProductPhotoUrl/);
  assert.match(scripts, /class="detail-photo"/);
  assert.match(scripts, /Comprobante del servicio/);
  assert.match(code, /function getItemPhotoFolder_/);
  assert.match(code, /ITEM_PHOTO_FOLDER_ID/);
  assert.match(code, /isProductPhoto && !mimeType\.startsWith\('image\/'\)/);
  assert.match(code, /item\.type !== 'Servicio'/);
  assert.match(code, /removeAttachment/);
});

test('el arranque detecta archivos de interfaz mezclados y nunca deja un cargador infinito', () => {
  const requiredIds = [
    'itemAttachmentTitle', 'itemRemoveAttachment', 'itemAttachmentPreview',
    'itemAttachmentPreviewImg', 'itemAttachmentFileIcon', 'itemAttachmentPreviewName',
    'itemAttachmentPreviewNote', 'removeItemAttachment', 'itemAttachmentIconUse',
    'itemAttachmentHelp'
  ];
  requiredIds.forEach(id => assert.match(indexHtml, new RegExp(`id="${id}"`)));
  assert.match(scripts, /const UI_REVISION = '4\.3\.2'/);
  assert.match(scripts, /function assertUiCompatibility\(\)/);
  assert.match(scripts, /Los archivos de Apps Script no son de la misma versión/);
  assert.match(scripts, /function failStartup\(message\)/);
  assert.match(scripts, /No recibimos la conexión de Cloudflare/);
  assert.match(scripts, /if \(options\.initial\) \{[\s\S]*?failStartup/);
  assert.ok(scripts.indexOf("window.addEventListener('message', handlePwaMessage)") < scripts.indexOf('function init()'));
});

test('el arranque tolera que Android bloquee localStorage dentro del marco de Google', () => {
  assert.match(scripts, /actor: safeStorageGet\(STORAGE_ACTOR\)/);
  assert.doesNotMatch(scripts, /(?<!window\.)localStorage\./);
  assert.match(scripts, /function safeStorageGet\(key\) \{[\s\S]*?try \{ return window\.localStorage\.getItem\(key\); \}[\s\S]*?catch/);
  assert.match(scripts, /document\.readyState === 'loading'/);

  const listeners = {};
  const google = { script: { run: {} } };
  const fakeWindow = {
    google,
    localStorage: {
      getItem() { throw new Error('Storage access is denied'); },
      setItem() { throw new Error('Storage access is denied'); },
      removeItem() { throw new Error('Storage access is denied'); }
    },
    addEventListener() {}
  };
  fakeWindow.top = fakeWindow;
  fakeWindow.parent = fakeWindow;
  const fakeDocument = {
    body: { dataset: { pwaChannel: 'prueba' } },
    readyState: 'loading',
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener(type, listener) { listeners[type] = listener; }
  };
  assert.doesNotThrow(() => runInNewContext(scripts, {
    window: fakeWindow,
    document: fakeDocument,
    location: { search: '', hash: '' },
    google,
    URLSearchParams,
    setTimeout,
    console
  }));
  assert.equal(typeof listeners.DOMContentLoaded, 'function');
});

test('Apps Script puede recibir la conexión por el fragmento si postMessage falla', () => {
  assert.match(scripts, /const FRAME_BOOTSTRAP = readFrameBootstrap\(\)/);
  assert.match(scripts, /get\('ceBridge'\)/);
  assert.match(scripts, /configurePushBridge\(FRAME_BOOTSTRAP\)/);
});

test('la interfaz ya no consulta cada dos minutos', () => {
  assert.doesNotMatch(scripts, /setInterval\s*\(/);
  assert.doesNotMatch(scripts, /INTERVALO_ACTUALIZACION/);
  assert.match(scripts, /visibilitychange/);
  assert.match(scripts, /casa-en-orden:refresh/);
});
