const APP = Object.freeze({
  NAME: 'Casa en Orden',
  SHEETS: Object.freeze({
    ITEMS: 'Pendientes',
    ACTIVITY: 'Actividad',
    SETTINGS: 'Configuracion',
    CATALOG: 'Catalogo'
  }),
  ITEM_HEADERS: Object.freeze([
    'ID', 'Tipo', 'Titulo', 'Detalle', 'Cantidad', 'Monto',
    'FechaVencimiento', 'Prioridad', 'Responsable', 'CreadoPor',
    'Estado', 'PortalURL', 'ComprobanteURL', 'ComprobanteNombre',
    'FechaCreacion', 'FechaActualizacion', 'CompletadoPor',
    'FechaCompletado', 'CatalogoID', 'ServicioModalidad', 'Frecuencia',
    'DiasFrecuencia', 'RepetirMonto', 'SerieID', 'AnteriorID'
  ]),
  ACTIVITY_HEADERS: Object.freeze([
    'ID', 'PendienteID', 'Accion', 'Descripcion', 'Actor', 'Fecha'
  ]),
  SETTINGS_HEADERS: Object.freeze(['Clave', 'Valor']),
  CATALOG_HEADERS: Object.freeze([
    'ID', 'Alias', 'Categoria', 'Ubicacion', 'Nombre', 'Marca', 'Modelo',
    'Especificacion', 'Presentacion', 'ImagenURL', 'CompraURL', 'Activo',
    'FechaActualizacion'
  ]),
  TYPES: Object.freeze(['Despensa', 'Servicio', 'Reparación', 'Otro']),
  PRIORITIES: Object.freeze(['Normal', 'Urgente']),
  STATUSES: Object.freeze(['Pendiente', 'Completado', 'Cancelado']),
  SERVICE_MODES: Object.freeze(['Único', 'Recurrente']),
  RECURRENCES: Object.freeze([
    'Semanal', 'Quincenal', 'Mensual', 'Bimestral', 'Trimestral',
    'Semestral', 'Anual', 'Personalizada'
  ]),
  MAX_ATTACHMENT_BYTES: 5 * 1024 * 1024
});

/**
 * Sirve la Web App.
 */
function doGet(event) {
  ensureSetup_();
  const template = HtmlService.createTemplateFromFile('Index');
  template.appName = APP.NAME;
  template.pwaChannel = cleanText_(event && event.parameter && event.parameter.pwaChannel, 120);
  return template.evaluate()
    .setTitle(APP.NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include_(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Ejecuta esta función una vez desde el editor de Apps Script.
 */
function setupCasaEnOrden_() {
  const spreadsheet = ensureSetup_();
  return {
    ok: true,
    spreadsheetId: spreadsheet.getId(),
    spreadsheetUrl: spreadsheet.getUrl(),
    message: 'Casa en Orden quedó configurada.'
  };
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Casa en Orden')
    .addItem('Configurar hojas', 'setupCasaEnOrden_')
    .addItem('Cargar datos de ejemplo', 'cargarDatosEjemplo_')
    .addSeparator()
    .addItem('Restablecer enlace de notificaciones', 'restablecerPuentePushPWA_')
    .addToUi();
}

/**
 * Datos iniciales para cada recarga o sincronización del cliente.
 */
function getBootstrapData(accessToken) {
  assertPwaAccess_(accessToken);
  ensureSetup_();
  return {
    appName: APP.NAME,
    settings: getSettings_(),
    items: getItems_(),
    activity: getActivity_(60),
    catalog: getCatalog_(),
    pushConfigured: isPushConfigured_(),
    serverTime: new Date().toISOString()
  };
}

function saveItem(payload, accessToken) {
  assertPwaAccess_(accessToken);
  ensureSetup_();
  const data = normalizeItemPayload_(payload);
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    const sheet = getSheet_(APP.SHEETS.ITEMS);
    const now = new Date();
    let rowNumber = 0;
    let current = null;

    if (data.id) {
      rowNumber = findItemRow_(data.id);
      if (!rowNumber) throw new Error('No encontramos el pendiente que quieres editar.');
      current = itemFromRow_(sheet.getRange(rowNumber, 1, 1, APP.ITEM_HEADERS.length).getValues()[0]);
    }

    const item = {
      id: data.id || createId_('HOG'),
      type: data.type,
      title: data.title,
      detail: data.detail,
      quantity: data.quantity,
      amount: data.amount,
      dueDate: data.dueDate,
      priority: data.priority,
      responsible: data.responsible,
      createdBy: current ? current.createdBy : data.actor,
      status: current ? current.status : 'Pendiente',
      portalUrl: data.portalUrl,
      receiptUrl: current ? current.receiptUrl : '',
      receiptName: current ? current.receiptName : '',
      createdAt: current ? current.createdAtRaw : now,
      updatedAt: now,
      completedBy: current ? current.completedBy : '',
      completedAt: current ? current.completedAtRaw : '',
      catalogId: data.catalogId,
      serviceMode: data.type === 'Servicio' ? data.serviceMode : '',
      recurrence: data.isRecurring ? data.recurrence : '',
      recurrenceDays: data.isRecurring ? data.recurrenceDays : '',
      repeatAmount: data.isRecurring ? data.repeatAmount : false,
      seriesId: data.isRecurring ? (current && current.seriesId ? current.seriesId : createId_('SER')) : '',
      previousItemId: current ? current.previousItemId : ''
    };

    const row = itemToRow_(item);
    if (rowNumber) {
      sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
    } else {
      sheet.appendRow(row);
    }

    const action = rowNumber ? 'Editó' : 'Agregó';
    addActivity_(item.id, action, `${action} ${item.title}`, data.actor);
    const notification = sendNotification_({
      actor: data.actor,
      subject: `${data.actor} ${rowNumber ? 'actualizó' : 'agregó'}: ${item.title}`,
      title: item.title,
      message: `${item.type} · Responsable: ${item.responsible || 'Sin asignar'}${item.dueDate ? ` · Fecha: ${formatDateHuman_(item.dueDate)}` : ''}`,
      itemId: item.id,
      priority: item.priority,
      originDeviceId: data.originDeviceId
    });

    SpreadsheetApp.flush();
    return {
      ok: true,
      item: publicItem_(itemFromRow_(row)),
      notificationSent: notification.sent,
      notificationMessage: notification.message || ''
    };
  } finally {
    lock.releaseLock();
  }
}

function setItemStatus(itemId, status, actor, originDeviceId, accessToken) {
  assertPwaAccess_(accessToken);
  ensureSetup_();
  const safeId = cleanText_(itemId, 80);
  const safeStatus = cleanText_(status, 30);
  const safeActor = cleanText_(actor, 80) || 'Alguien';
  if (!safeId) throw new Error('Falta identificar el pendiente.');
  if (!APP.STATUSES.includes(safeStatus)) throw new Error('El estado no es válido.');

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sheet = getSheet_(APP.SHEETS.ITEMS);
    const rowNumber = findItemRow_(safeId);
    if (!rowNumber) throw new Error('El pendiente ya no existe.');

    const item = itemFromRow_(sheet.getRange(rowNumber, 1, 1, APP.ITEM_HEADERS.length).getValues()[0]);
    item.status = safeStatus;
    item.updatedAt = new Date();
    item.updatedAtRaw = item.updatedAt;
    item.completedBy = safeStatus === 'Completado' ? safeActor : '';
    item.completedAt = safeStatus === 'Completado' ? new Date() : '';
    item.completedAtRaw = item.completedAt;
    const row = itemToRow_(item);
    sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);

    const verb = safeStatus === 'Completado' ? 'Completó' : safeStatus === 'Cancelado' ? 'Canceló' : 'Reabrió';
    addActivity_(safeId, verb, `${verb} ${item.title}`, safeActor);
    const nextItem = safeStatus === 'Completado' ? createNextRecurringItem_(item) : null;
    sendNotification_({
      actor: safeActor,
      subject: `${safeActor} ${verb.toLowerCase()}: ${item.title}`,
      title: item.title,
      message: `Nuevo estado: ${safeStatus}`,
      itemId: item.id,
      priority: item.priority,
      originDeviceId: cleanText_(originDeviceId, 120)
    });
    SpreadsheetApp.flush();
    return {
      ok: true,
      item: publicItem_(itemFromRow_(row)),
      nextItem: nextItem ? publicItem_(nextItem) : null
    };
  } finally {
    lock.releaseLock();
  }
}

function uploadReceipt(payload, accessToken) {
  assertPwaAccess_(accessToken);
  ensureSetup_();
  const itemId = cleanText_(payload && payload.itemId, 80);
  const actor = cleanText_(payload && payload.actor, 80) || 'Alguien';
  const filename = sanitizeFilename_(payload && payload.filename);
  const dataUrl = String(payload && payload.dataUrl || '');
  if (!itemId || !dataUrl) throw new Error('Selecciona un archivo para guardar.');

  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('El archivo no tiene un formato válido.');
  const mimeType = match[1].toLowerCase();
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (!allowed.includes(mimeType)) throw new Error('Usa una imagen JPG, PNG, WEBP o un PDF.');

  const bytes = Utilities.base64Decode(match[2]);
  if (bytes.length > APP.MAX_ATTACHMENT_BYTES) throw new Error('El archivo debe pesar menos de 5 MB.');

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sheet = getSheet_(APP.SHEETS.ITEMS);
    const rowNumber = findItemRow_(itemId);
    if (!rowNumber) throw new Error('No encontramos el pendiente relacionado.');
    const item = itemFromRow_(sheet.getRange(rowNumber, 1, 1, APP.ITEM_HEADERS.length).getValues()[0]);

    const folder = getReceiptFolder_();
    const finalName = `${item.id}-${filename}`;
    const blob = Utilities.newBlob(bytes, mimeType, finalName);
    const file = folder.createFile(blob);
    const fileUrl = file.getUrl();

    item.receiptUrl = fileUrl;
    item.receiptName = filename;
    item.updatedAt = new Date();
    item.updatedAtRaw = item.updatedAt;
    const row = itemToRow_(item);
    sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
    addActivity_(itemId, 'Adjuntó', `Adjuntó ${filename} a ${item.title}`, actor);
    SpreadsheetApp.flush();
    return { ok: true, item: publicItem_(itemFromRow_(row)) };
  } finally {
    lock.releaseLock();
  }
}

function saveSettings(payload, accessToken) {
  assertPwaAccess_(accessToken);
  ensureSetup_();
  const values = {
    CASA_NOMBRE: cleanText_(payload && payload.homeName, 80) || APP.NAME,
    PERSONA_1_NOMBRE: cleanText_(payload && payload.person1Name, 80) || 'Axel',
    PERSONA_1_EMAIL: cleanEmail_(payload && payload.person1Email),
    PERSONA_2_NOMBRE: cleanText_(payload && payload.person2Name, 80) || 'Laura',
    PERSONA_2_EMAIL: cleanEmail_(payload && payload.person2Email),
    ENVIAR_CORREOS: payload && payload.sendEmails ? 'SI' : 'NO'
  };

  const sheet = getSheet_(APP.SHEETS.SETTINGS);
  const current = sheet.getLastRow() > 1
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues()
    : [];
  const map = {};
  current.forEach((row, index) => { map[String(row[0])] = index + 2; });
  Object.keys(values).forEach(key => {
    if (map[key]) sheet.getRange(map[key], 2).setValue(values[key]);
    else sheet.appendRow([key, values[key]]);
  });
  shareReceiptFolder_();
  addActivity_('', 'Configuró', 'Actualizó la configuración del hogar', cleanText_(payload && payload.actor, 80) || 'Alguien');
  SpreadsheetApp.flush();
  return { ok: true, settings: getSettings_() };
}

function saveCatalogEntry(payload, accessToken) {
  assertPwaAccess_(accessToken);
  ensureSetup_();
  const data = normalizeCatalogPayload_(payload);
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    const sheet = getSheet_(APP.SHEETS.CATALOG);
    let rowNumber = 0;
    let current = null;
    if (data.id) {
      rowNumber = findCatalogRow_(data.id);
      if (!rowNumber) throw new Error('No encontramos el producto del catálogo.');
      current = catalogFromRow_(sheet.getRange(rowNumber, 1, 1, APP.CATALOG_HEADERS.length).getValues()[0]);
    }

    const entry = {
      id: data.id || createId_('CAT'),
      alias: data.alias,
      category: '',
      location: '',
      name: '',
      brand: '',
      model: '',
      specification: data.description,
      presentation: '',
      imageUrl: data.imageUrl,
      purchaseUrl: data.purchaseUrl,
      active: current ? current.active : true,
      updatedAt: new Date()
    };
    const row = catalogToRow_(entry);
    if (rowNumber) sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
    else sheet.appendRow(row);

    const actor = cleanText_(payload && payload.actor, 80) || 'Alguien';
    addActivity_('', rowNumber ? 'Editó catálogo' : 'Agregó al catálogo', `${rowNumber ? 'Actualizó' : 'Agregó'} ${entry.alias} en el catálogo`, actor);
    SpreadsheetApp.flush();
    return { ok: true, entry: publicCatalogEntry_(catalogFromRow_(row)) };
  } finally {
    lock.releaseLock();
  }
}

function setCatalogEntryActive(catalogId, active, actor, accessToken) {
  assertPwaAccess_(accessToken);
  ensureSetup_();
  const safeId = cleanText_(catalogId, 80);
  if (!safeId) throw new Error('Falta identificar el producto del catálogo.');
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    const sheet = getSheet_(APP.SHEETS.CATALOG);
    const rowNumber = findCatalogRow_(safeId);
    if (!rowNumber) throw new Error('El producto ya no existe en el catálogo.');
    const entry = catalogFromRow_(sheet.getRange(rowNumber, 1, 1, APP.CATALOG_HEADERS.length).getValues()[0]);
    entry.active = Boolean(active);
    entry.updatedAt = new Date();
    entry.updatedAtRaw = entry.updatedAt;
    const row = catalogToRow_(entry);
    sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
    const safeActor = cleanText_(actor, 80) || 'Alguien';
    addActivity_('', entry.active ? 'Activó catálogo' : 'Desactivó catálogo', `${entry.active ? 'Activó' : 'Desactivó'} ${entry.alias} en el catálogo`, safeActor);
    SpreadsheetApp.flush();
    return { ok: true, entry: publicCatalogEntry_(catalogFromRow_(row)) };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Agrega información ficticia para conocer la interfaz. No se ejecuta automáticamente.
 */
function cargarDatosEjemplo_() {
  ensureSetup_();
  const sheet = getSheet_(APP.SHEETS.ITEMS);
  if (sheet.getLastRow() > 1) throw new Error('La hoja Pendientes ya contiene información.');
  const now = new Date();
  const plusDays = days => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  };
  const samples = [
    sampleItem_('Servicio', 'Luz', 'Recibo bimestral', 1, 620, plusDays(4), 'Urgente', 'Axel', 'Laura', 'https://www.cfe.mx/'),
    sampleItem_('Servicio', 'Internet', 'Mensualidad', 1, 549, plusDays(8), 'Normal', 'Axel', 'Axel', ''),
    sampleItem_('Despensa', 'Papel higiénico', 'Comprar dos paquetes', 2, '', '', 'Urgente', 'Axel', 'Laura', ''),
    sampleItem_('Despensa', 'Café y jabón de trastes', '', 1, '', '', 'Normal', 'Axel', 'Laura', ''),
    sampleItem_('Reparación', 'Lámpara de la recámara', 'Comprar foco cálido, base E27', 1, '', '', 'Normal', 'Axel', 'Laura', '')
  ];
  sheet.getRange(2, 1, samples.length, APP.ITEM_HEADERS.length).setValues(samples.map(itemToRow_));
  samples.forEach(item => addActivity_(item.id, 'Agregó', `Agregó ${item.title}`, item.createdBy));
  return { ok: true, count: samples.length };
}

function ensureSetup_() {
  const spreadsheet = getSpreadsheet_();
  ensureSheet_(spreadsheet, APP.SHEETS.ITEMS, APP.ITEM_HEADERS);
  ensureSheet_(spreadsheet, APP.SHEETS.ACTIVITY, APP.ACTIVITY_HEADERS);
  ensureSheet_(spreadsheet, APP.SHEETS.CATALOG, APP.CATALOG_HEADERS);
  const settingsSheet = ensureSheet_(spreadsheet, APP.SHEETS.SETTINGS, APP.SETTINGS_HEADERS);

  if (settingsSheet.getLastRow() === 1) {
    settingsSheet.getRange(2, 1, 6, 2).setValues([
      ['CASA_NOMBRE', APP.NAME],
      ['PERSONA_1_NOMBRE', 'Axel'],
      ['PERSONA_1_EMAIL', ''],
      ['PERSONA_2_NOMBRE', 'Laura'],
      ['PERSONA_2_EMAIL', ''],
      ['ENVIAR_CORREOS', 'NO']
    ]);
  }
  return spreadsheet;
}

function getSpreadsheet_() {
  const properties = PropertiesService.getScriptProperties();
  const storedId = properties.getProperty('SPREADSHEET_ID');
  if (storedId) return SpreadsheetApp.openById(storedId);

  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) {
    throw new Error('Vincula este proyecto a una Hoja de cálculo y usa Casa en Orden > Configurar hojas.');
  }
  properties.setProperty('SPREADSHEET_ID', active.getId());
  return active;
}

function ensureSheet_(spreadsheet, name, headers) {
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);
  if (sheet.getLastRow() === 0) sheet.appendRow(headers);

  const existingHeaders = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getDisplayValues()[0];
  headers.forEach((header, index) => {
    if (existingHeaders[index] !== header) sheet.getRange(1, index + 1).setValue(header);
  });
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold')
    .setBackground('#F1F1EE')
    .setFontColor('#2A2A27');
  sheet.autoResizeColumns(1, headers.length);
  return sheet;
}

function getSheet_(name) {
  const sheet = getSpreadsheet_().getSheetByName(name);
  if (!sheet) throw new Error(`Falta la hoja ${name}. Usa Casa en Orden > Configurar hojas.`);
  return sheet;
}

function getItems_() {
  const sheet = getSheet_(APP.SHEETS.ITEMS);
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, APP.ITEM_HEADERS.length)
    .getValues()
    .filter(row => row[0])
    .map(row => publicItem_(itemFromRow_(row)))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

function getActivity_(limit) {
  const sheet = getSheet_(APP.SHEETS.ACTIVITY);
  if (sheet.getLastRow() < 2) return [];
  const count = Math.min(Number(limit) || 60, sheet.getLastRow() - 1);
  const start = Math.max(2, sheet.getLastRow() - count + 1);
  return sheet.getRange(start, 1, count, APP.ACTIVITY_HEADERS.length)
    .getValues()
    .filter(row => row[0])
    .map(row => ({
      id: String(row[0]),
      itemId: String(row[1] || ''),
      action: String(row[2] || ''),
      description: String(row[3] || ''),
      actor: String(row[4] || ''),
      date: toIso_(row[5])
    }))
    .reverse();
}

function getCatalog_() {
  const sheet = getSheet_(APP.SHEETS.CATALOG);
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, APP.CATALOG_HEADERS.length)
    .getValues()
    .filter(row => row[0])
    .map(row => publicCatalogEntry_(catalogFromRow_(row)))
    .sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return String(a.alias).localeCompare(String(b.alias), 'es', { sensitivity: 'base' });
    });
}

function getSettings_() {
  const sheet = getSheet_(APP.SHEETS.SETTINGS);
  const rows = sheet.getLastRow() > 1
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getDisplayValues()
    : [];
  const settings = {};
  rows.forEach(row => { if (row[0]) settings[row[0]] = row[1]; });
  return {
    homeName: settings.CASA_NOMBRE || APP.NAME,
    person1Name: settings.PERSONA_1_NOMBRE || 'Axel',
    person1Email: settings.PERSONA_1_EMAIL || '',
    person2Name: settings.PERSONA_2_NOMBRE || 'Laura',
    person2Email: settings.PERSONA_2_EMAIL || '',
    sendEmails: settings.ENVIAR_CORREOS === 'SI'
  };
}

function normalizeItemPayload_(payload) {
  const type = cleanText_(payload && payload.type, 30);
  const title = cleanText_(payload && payload.title, 120);
  const priority = cleanText_(payload && payload.priority, 30) || 'Normal';
  if (!APP.TYPES.includes(type)) throw new Error('Elige una categoría válida.');
  if (!title) throw new Error('Escribe qué hace falta o qué se debe hacer.');
  if (!APP.PRIORITIES.includes(priority)) throw new Error('La prioridad no es válida.');

  const portalUrl = cleanUrl_(payload && payload.portalUrl);
  const amountRaw = payload && payload.amount;
  const amount = amountRaw === '' || amountRaw == null ? '' : Math.max(0, Number(amountRaw) || 0);
  const quantityRaw = payload && payload.quantity;
  const quantity = quantityRaw === '' || quantityRaw == null ? '' : Math.max(0, Number(quantityRaw) || 0);
  const dueDate = cleanDate_(payload && payload.dueDate);
  const serviceMode = type === 'Servicio'
    ? cleanText_(payload && payload.serviceMode, 30) || 'Único'
    : '';
  if (serviceMode && !APP.SERVICE_MODES.includes(serviceMode)) throw new Error('La modalidad del servicio no es válida.');
  const isRecurring = type === 'Servicio' && serviceMode === 'Recurrente';
  const recurrence = isRecurring ? cleanText_(payload && payload.recurrence, 30) : '';
  if (isRecurring && !APP.RECURRENCES.includes(recurrence)) throw new Error('Elige cada cuánto se repite el servicio.');
  if (isRecurring && !dueDate) throw new Error('Indica la primera fecha de vencimiento del servicio recurrente.');
  const recurrenceDaysRaw = Number(payload && payload.recurrenceDays);
  const recurrenceDays = recurrence === 'Personalizada'
    ? Math.max(1, Math.min(730, Math.round(recurrenceDaysRaw || 0)))
    : '';
  if (recurrence === 'Personalizada' && !recurrenceDaysRaw) throw new Error('Indica cada cuántos días se repite el servicio.');

  return {
    id: cleanText_(payload && payload.id, 80),
    type,
    title,
    detail: cleanText_(payload && payload.detail, 500),
    quantity,
    amount,
    dueDate,
    priority,
    responsible: cleanText_(payload && payload.responsible, 80),
    actor: cleanText_(payload && payload.actor, 80) || 'Alguien',
    portalUrl,
    catalogId: cleanText_(payload && payload.catalogId, 80),
    serviceMode,
    isRecurring,
    recurrence,
    recurrenceDays,
    repeatAmount: Boolean(payload && payload.repeatAmount),
    originDeviceId: cleanText_(payload && payload.originDeviceId, 120)
  };
}

function normalizeCatalogPayload_(payload) {
  const alias = cleanText_(payload && payload.alias, 120);
  if (!alias) throw new Error('Escribe el nombre del producto.');
  const legacyDescription = [
    payload && payload.name,
    payload && payload.brand,
    payload && payload.model,
    payload && payload.specification,
    payload && payload.presentation,
    payload && payload.location
  ].map(value => cleanText_(value, 500)).filter(Boolean).join(' · ');
  return {
    id: cleanText_(payload && payload.id, 80),
    alias,
    description: cleanText_(payload && payload.description, 500) || cleanText_(legacyDescription, 500),
    imageUrl: cleanUrl_(payload && payload.imageUrl),
    purchaseUrl: cleanUrl_(payload && payload.purchaseUrl)
  };
}

function itemToRow_(item) {
  return [
    item.id, item.type, item.title, item.detail, item.quantity, item.amount,
    item.dueDate, item.priority, item.responsible, item.createdBy,
    item.status, item.portalUrl, item.receiptUrl, item.receiptName,
    item.createdAtRaw || item.createdAt, item.updatedAtRaw || item.updatedAt,
    item.completedBy, item.completedAtRaw || item.completedAt,
    item.catalogId || '', item.serviceMode || '', item.recurrence || '',
    item.recurrenceDays === '' ? '' : Number(item.recurrenceDays || 0),
    item.repeatAmount ? 'SI' : 'NO', item.seriesId || '', item.previousItemId || ''
  ];
}

function itemFromRow_(row) {
  return {
    id: String(row[0] || ''),
    type: String(row[1] || ''),
    title: String(row[2] || ''),
    detail: String(row[3] || ''),
    quantity: row[4] === '' ? '' : Number(row[4]),
    amount: row[5] === '' ? '' : Number(row[5]),
    dueDate: dateOnly_(row[6]),
    priority: String(row[7] || 'Normal'),
    responsible: String(row[8] || ''),
    createdBy: String(row[9] || ''),
    status: String(row[10] || 'Pendiente'),
    portalUrl: String(row[11] || ''),
    receiptUrl: String(row[12] || ''),
    receiptName: String(row[13] || ''),
    createdAt: toIso_(row[14]),
    updatedAt: toIso_(row[15]),
    completedBy: String(row[16] || ''),
    completedAt: toIso_(row[17]),
    catalogId: String(row[18] || ''),
    serviceMode: String(row[19] || (String(row[1] || '') === 'Servicio' ? 'Único' : '')),
    recurrence: String(row[20] || ''),
    recurrenceDays: row[21] === '' ? '' : Number(row[21]),
    repeatAmount: String(row[22] || '').toUpperCase() === 'SI',
    seriesId: String(row[23] || ''),
    previousItemId: String(row[24] || ''),
    createdAtRaw: row[14] || '',
    updatedAtRaw: row[15] || '',
    completedAtRaw: row[17] || ''
  };
}

function publicItem_(item) {
  const copy = Object.assign({}, item);
  delete copy.createdAtRaw;
  delete copy.updatedAtRaw;
  delete copy.completedAtRaw;
  return copy;
}

function catalogToRow_(entry) {
  return [
    entry.id, entry.alias, entry.category, entry.location, entry.name,
    entry.brand, entry.model, entry.specification, entry.presentation,
    entry.imageUrl, entry.purchaseUrl, entry.active ? 'SI' : 'NO',
    entry.updatedAtRaw || entry.updatedAt
  ];
}

function catalogFromRow_(row) {
  return {
    id: String(row[0] || ''),
    alias: String(row[1] || ''),
    category: String(row[2] || ''),
    location: String(row[3] || ''),
    name: String(row[4] || ''),
    brand: String(row[5] || ''),
    model: String(row[6] || ''),
    specification: String(row[7] || ''),
    presentation: String(row[8] || ''),
    imageUrl: String(row[9] || ''),
    purchaseUrl: String(row[10] || ''),
    active: String(row[11] || 'SI').toUpperCase() !== 'NO',
    updatedAt: toIso_(row[12]),
    updatedAtRaw: row[12] || ''
  };
}

function publicCatalogEntry_(entry) {
  const copy = Object.assign({}, entry);
  copy.description = catalogDescription_(entry);
  delete copy.updatedAtRaw;
  return copy;
}

function catalogDescription_(entry) {
  const alias = cleanText_(entry && entry.alias, 120).toLowerCase();
  const values = [
    entry && entry.description,
    entry && entry.name,
    entry && entry.brand,
    entry && entry.model,
    entry && entry.specification,
    entry && entry.presentation,
    entry && entry.location ? `Ubicación: ${entry.location}` : ''
  ].map(value => cleanText_(value, 500)).filter(value => value && value.toLowerCase() !== alias);
  return values.filter((value, index) => values.findIndex(candidate => candidate.toLowerCase() === value.toLowerCase()) === index)
    .join(' · ')
    .slice(0, 500);
}

function findItemRow_(itemId) {
  const sheet = getSheet_(APP.SHEETS.ITEMS);
  if (sheet.getLastRow() < 2) return 0;
  const finder = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1)
    .createTextFinder(itemId)
    .matchEntireCell(true)
    .findNext();
  return finder ? finder.getRow() : 0;
}

function findCatalogRow_(catalogId) {
  const sheet = getSheet_(APP.SHEETS.CATALOG);
  if (sheet.getLastRow() < 2) return 0;
  const finder = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1)
    .createTextFinder(catalogId)
    .matchEntireCell(true)
    .findNext();
  return finder ? finder.getRow() : 0;
}

function addActivity_(itemId, action, description, actor) {
  getSheet_(APP.SHEETS.ACTIVITY).appendRow([
    createId_('ACT'), itemId || '', action, description, actor, new Date()
  ]);
}

function createNextRecurringItem_(item) {
  if (item.type !== 'Servicio' || item.serviceMode !== 'Recurrente' || !item.seriesId || !item.recurrence) return null;
  const sheet = getSheet_(APP.SHEETS.ITEMS);
  if (sheet.getLastRow() > 1) {
    const previousIds = sheet.getRange(2, 25, sheet.getLastRow() - 1, 1).getDisplayValues();
    const existingIndex = previousIds.findIndex(row => String(row[0]) === item.id);
    if (existingIndex >= 0) {
      return itemFromRow_(sheet.getRange(existingIndex + 2, 1, 1, APP.ITEM_HEADERS.length).getValues()[0]);
    }
  }

  const now = new Date();
  const next = {
    id: createId_('HOG'),
    type: 'Servicio',
    title: item.title,
    detail: item.detail,
    quantity: item.quantity,
    amount: item.repeatAmount ? item.amount : '',
    dueDate: nextRecurrenceDate_(item.dueDate, item.recurrence, item.recurrenceDays),
    priority: item.priority,
    responsible: item.responsible,
    createdBy: 'Casa en Orden',
    status: 'Pendiente',
    portalUrl: item.portalUrl,
    receiptUrl: '',
    receiptName: '',
    createdAt: now,
    updatedAt: now,
    completedBy: '',
    completedAt: '',
    catalogId: item.catalogId,
    serviceMode: 'Recurrente',
    recurrence: item.recurrence,
    recurrenceDays: item.recurrenceDays,
    repeatAmount: item.repeatAmount,
    seriesId: item.seriesId,
    previousItemId: item.id
  };
  const row = itemToRow_(next);
  sheet.appendRow(row);
  addActivity_(next.id, 'Programó', `Programó el siguiente pago de ${next.title}`, 'Casa en Orden');
  return itemFromRow_(row);
}

function nextRecurrenceDate_(dateString, recurrence, customDays) {
  const safeDate = cleanDate_(dateString) || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const parts = safeDate.split('-').map(Number);
  const base = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
  const dayMap = { Semanal: 7, Quincenal: 15 };
  const monthMap = { Mensual: 1, Bimestral: 2, Trimestral: 3, Semestral: 6, Anual: 12 };

  if (dayMap[recurrence] || recurrence === 'Personalizada') {
    base.setDate(base.getDate() + (dayMap[recurrence] || Math.max(1, Number(customDays) || 1)));
  } else {
    const months = monthMap[recurrence] || 1;
    const baseLastDay = new Date(base.getFullYear(), base.getMonth() + 1, 0, 12, 0, 0).getDate();
    const wasLastDay = base.getDate() === baseLastDay;
    const target = new Date(base.getFullYear(), base.getMonth() + months, 1, 12, 0, 0);
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0, 12, 0, 0).getDate();
    target.setDate(wasLastDay ? lastDay : Math.min(base.getDate(), lastDay));
    base.setTime(target.getTime());
  }
  return Utilities.formatDate(base, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function sendNotification_(message) {
  const push = sendPushNotification_(message);
  const email = sendEmailNotification_(message);
  const sent = push.sent || email.sent;
  const messages = [];
  if (!sent) {
    if (push.message) messages.push(push.message);
    if (email.message && email.message !== push.message) messages.push(email.message);
  }
  return {
    sent,
    pushSent: push.sent,
    emailSent: email.sent,
    message: messages.join(' ')
  };
}

function sendPushNotification_(message) {
  const properties = PropertiesService.getScriptProperties();
  const notifyUrl = properties.getProperty('PWA_NOTIFY_URL');
  const secret = properties.getProperty('PWA_NOTIFY_SECRET');
  if (!notifyUrl || !secret) {
    return { sent: false, message: 'Activa las notificaciones desde la versión instalable de la app.' };
  }

  try {
    const response = UrlFetchApp.fetch(notifyUrl, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: `Bearer ${secret}` },
      payload: JSON.stringify({
        actor: cleanText_(message.actor, 80) || 'Alguien',
        actorRole: actorRole_(message.actor),
        title: cleanText_(message.subject, 100) || APP.NAME,
        body: cleanText_(message.message, 280) || cleanText_(message.title, 120),
        itemId: cleanText_(message.itemId, 80),
        priority: cleanText_(message.priority, 20),
        originDeviceId: cleanText_(message.originDeviceId, 120)
      }),
      muteHttpExceptions: true
    });
    const status = response.getResponseCode();
    let result = {};
    try { result = JSON.parse(response.getContentText() || '{}'); } catch (parseError) { console.warn(parseError); }
    if (status >= 200 && status < 300 && result.ok) {
      const sent = Number(result.sent) > 0;
      return { sent, message: sent ? '' : 'No hay otro teléfono con notificaciones activas.' };
    }
    console.warn(`Web Push respondió ${status}: ${response.getContentText()}`);
    return { sent: false, message: 'El cambio se guardó, pero el aviso push no pudo enviarse.' };
  } catch (error) {
    console.error(error);
    return { sent: false, message: 'El cambio se guardó, pero el aviso push no pudo enviarse.' };
  }
}

function sendEmailNotification_(message) {
  const settings = getSettings_();
  if (!settings.sendEmails) return { sent: false, message: 'Avisos por correo desactivados.' };

  const people = [
    { name: settings.person1Name, email: settings.person1Email },
    { name: settings.person2Name, email: settings.person2Email }
  ];
  const recipients = people
    .filter(person => person.email && person.name.toLowerCase() !== String(message.actor).toLowerCase())
    .map(person => person.email);
  if (!recipients.length) return { sent: false, message: 'Falta configurar el correo de la otra persona.' };

  try {
    const url = PropertiesService.getScriptProperties().getProperty('PWA_APP_URL') || ScriptApp.getService().getUrl() || '';
    const html = [
      '<div style="font-family:Arial,sans-serif;color:#292925;max-width:520px">',
      `<h2 style="color:#48654b">${escapeHtml_(message.subject)}</h2>`,
      `<p><strong>${escapeHtml_(message.title)}</strong></p>`,
      `<p>${escapeHtml_(message.message)}</p>`,
      url ? `<p><a href="${url}" style="display:inline-block;background:#48654b;color:white;padding:12px 18px;border-radius:10px;text-decoration:none">Abrir Casa en Orden</a></p>` : '',
      '<p style="font-size:12px;color:#777">Aviso automático de Casa en Orden.</p>',
      '</div>'
    ].join('');
    MailApp.sendEmail({
      to: recipients.join(','),
      subject: message.subject,
      htmlBody: html,
      name: settings.homeName || APP.NAME
    });
    return { sent: true };
  } catch (error) {
    console.error(error);
    return { sent: false, message: 'El pendiente se guardó, pero no se pudo enviar el correo.' };
  }
}

/**
 * Recibe una sola vez el puente creado por la PWA. No permite reemplazar una
 * configuración existente desde la página pública.
 */
function configurarPuentePushPWA(payload) {
  const notifyUrl = cleanText_(payload && payload.notifyUrl, 500);
  const notifySecret = cleanText_(payload && payload.notifySecret, 300);
  const appAccessToken = cleanText_(payload && payload.appAccessToken, 300);
  const pwaUrl = cleanText_(payload && payload.pwaUrl, 500);
  if (!/^https:\/\/[^/]+\/api\/notify\/?$/i.test(notifyUrl)) {
    throw new Error('La dirección del puente de notificaciones no es válida.');
  }
  if (!/^https:\/\/[^/]+\/?$/i.test(pwaUrl)) {
    throw new Error('La dirección de la PWA no es válida.');
  }
  if (notifySecret.length < 32) throw new Error('La clave del puente está incompleta.');
  if (appAccessToken.length < 32) throw new Error('La clave de acceso a la app está incompleta.');

  const properties = PropertiesService.getScriptProperties();
  const existingUrl = properties.getProperty('PWA_NOTIFY_URL');
  const existingSecret = properties.getProperty('PWA_NOTIFY_SECRET');
  const existingAccessToken = properties.getProperty('PWA_ACCESS_TOKEN');
  if (existingUrl || existingSecret || existingAccessToken) {
    if (existingUrl === notifyUrl && existingSecret === notifySecret && existingAccessToken === appAccessToken) {
      return { ok: true, alreadyConfigured: true };
    }
    throw new Error('Este proyecto ya está enlazado. Usa el menú de la Hoja para restablecer el enlace si cambiaste de PWA.');
  }

  const statusUrl = notifyUrl.replace(/\/api\/notify\/?$/i, '/api/bridge-status');
  const response = UrlFetchApp.fetch(statusUrl, {
    method: 'get',
    headers: { Authorization: `Bearer ${notifySecret}` },
    muteHttpExceptions: true
  });
  let result = {};
  try { result = JSON.parse(response.getContentText() || '{}'); } catch (parseError) { console.warn(parseError); }
  if (response.getResponseCode() !== 200 || !result.ok || result.app !== 'casa-en-orden') {
    throw new Error('Cloudflare no pudo confirmar la clave del puente. Intenta vincular el teléfono otra vez.');
  }

  properties.setProperties({
    PWA_NOTIFY_URL: notifyUrl,
    PWA_NOTIFY_SECRET: notifySecret,
    PWA_ACCESS_TOKEN: appAccessToken,
    PWA_APP_URL: pwaUrl.replace(/\/?$/, '/')
  });
  return { ok: true, alreadyConfigured: false };
}

function isPushConfigured_() {
  const properties = PropertiesService.getScriptProperties();
  return Boolean(
    properties.getProperty('PWA_NOTIFY_URL') &&
    properties.getProperty('PWA_NOTIFY_SECRET') &&
    properties.getProperty('PWA_ACCESS_TOKEN')
  );
}

function assertPwaAccess_(candidate) {
  const expected = PropertiesService.getScriptProperties().getProperty('PWA_ACCESS_TOKEN');
  if (!expected || !constantTimeEqual_(String(candidate || ''), expected)) {
    throw new Error('Abre Casa en Orden desde la PWA instalada y vincula este teléfono con el PIN del hogar.');
  }
}

function constantTimeEqual_(left, right) {
  const a = String(left || '');
  const b = String(right || '');
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}

/**
 * El sufijo _ evita que una página pública invoque esta función mediante
 * google.script.run. Se usa desde el editor o desde el menú de la Hoja.
 */
function restablecerPuentePushPWA_() {
  const properties = PropertiesService.getScriptProperties();
  properties.deleteProperty('PWA_NOTIFY_URL');
  properties.deleteProperty('PWA_NOTIFY_SECRET');
  properties.deleteProperty('PWA_ACCESS_TOKEN');
  properties.deleteProperty('PWA_APP_URL');
  try {
    SpreadsheetApp.getUi().alert('Enlace de notificaciones restablecido. Abre de nuevo la PWA para volver a conectarlo.');
  } catch (error) {
    console.info(error);
  }
  return { ok: true };
}

function getReceiptFolder_() {
  const properties = PropertiesService.getScriptProperties();
  const folderId = properties.getProperty('RECEIPT_FOLDER_ID');
  if (folderId) {
    try { return DriveApp.getFolderById(folderId); } catch (error) { console.warn(error); }
  }
  const folder = DriveApp.createFolder('Casa en Orden - Comprobantes');
  properties.setProperty('RECEIPT_FOLDER_ID', folder.getId());
  shareReceiptFolder_(folder);
  return folder;
}

function shareReceiptFolder_(folder) {
  const target = folder || (() => {
    const folderId = PropertiesService.getScriptProperties().getProperty('RECEIPT_FOLDER_ID');
    if (!folderId) return null;
    try { return DriveApp.getFolderById(folderId); } catch (error) { return null; }
  })();
  if (!target) return;
  const settings = getSettings_();
  [settings.person1Email, settings.person2Email].filter(Boolean).forEach(email => {
    try { target.addViewer(email); } catch (error) { console.warn(`No se pudo compartir con ${email}: ${error.message}`); }
  });
}

function sampleItem_(type, title, detail, quantity, amount, dueDate, priority, responsible, createdBy, portalUrl) {
  const now = new Date();
  return {
    id: createId_('HOG'), type, title, detail, quantity, amount, dueDate,
    priority, responsible, createdBy, status: 'Pendiente', portalUrl,
    receiptUrl: '', receiptName: '', createdAt: now, updatedAt: now,
    completedBy: '', completedAt: '', catalogId: '',
    serviceMode: type === 'Servicio' ? 'Único' : '', recurrence: '',
    recurrenceDays: '', repeatAmount: false, seriesId: '', previousItemId: ''
  };
}

function createId_(prefix) {
  return `${prefix}-${Utilities.getUuid().split('-')[0].toUpperCase()}`;
}

function actorRole_(actor) {
  const settings = getSettings_();
  const normalized = cleanText_(actor, 80).toLowerCase();
  if (normalized && normalized === String(settings.person2Name || '').toLowerCase()) return 'person2';
  if (normalized && normalized === String(settings.person1Name || '').toLowerCase()) return 'person1';
  return '';
}

function cleanText_(value, maxLength) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, maxLength || 500);
}

function cleanEmail_(value) {
  const email = cleanText_(value, 200).toLowerCase();
  if (!email) return '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`El correo ${email} no es válido.`);
  return email;
}

function cleanUrl_(value) {
  const url = cleanText_(value, 500);
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) throw new Error('El enlace debe comenzar con https://');
  return url;
}

function cleanDate_(value) {
  const date = cleanText_(value, 10);
  if (!date) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('La fecha límite no es válida.');
  return date;
}

function sanitizeFilename_(value) {
  const name = cleanText_(value, 120).replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ._ -]/g, '_');
  return name || 'comprobante';
}

function dateOnly_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  const text = String(value);
  const iso = text.match(/^\d{4}-\d{2}-\d{2}/);
  return iso ? iso[0] : text;
}

function toIso_(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return isNaN(date) ? '' : date.toISOString();
}

function formatDateHuman_(dateString) {
  if (!dateString) return '';
  const parts = String(dateString).split('-').map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'd MMM yyyy');
}

function escapeHtml_(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
