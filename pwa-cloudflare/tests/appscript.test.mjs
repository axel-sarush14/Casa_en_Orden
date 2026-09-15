import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const codePath = `${projectRoot}apps-script/Code.gs`;
const scriptsPath = `${projectRoot}apps-script/Scripts.html`;
const code = readFileSync(codePath, 'utf8');
const scriptsHtml = readFileSync(scriptsPath, 'utf8');
const scripts = scriptsHtml.match(/<script>([\s\S]*)<\/script>/)?.[1] || '';

function loadAppsScriptHelpers() {
  const Utilities = {
    formatDate(value) {
      const date = new Date(value);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }
  };
  const Session = { getScriptTimeZone: () => 'UTC' };
  return new Function('Utilities', 'Session', `${code}; return { APP, nextRecurrenceDate_ };`)(Utilities, Session);
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

test('la interfaz ya no consulta cada dos minutos', () => {
  assert.doesNotMatch(scripts, /setInterval\s*\(/);
  assert.doesNotMatch(scripts, /INTERVALO_ACTUALIZACION/);
  assert.match(scripts, /visibilitychange/);
  assert.match(scripts, /casa-en-orden:refresh/);
});
