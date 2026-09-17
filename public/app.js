const STORAGE_DEVICE = 'casaEnOrden.pwa.device.v3';
const STORAGE_INSTALL_DISMISSED = 'casaEnOrden.pwa.installDismissed.v3';
const LAUNCH_PARAMS = new URLSearchParams(location.search);

const state = {
  config: null,
  registration: null,
  device: readStoredDevice(),
  actor: '',
  ownerRole: '',
  bridge: null,
  frameReady: false,
  frameChannel: typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  frameMessenger: null,
  forceActorOnce: false,
  launchActor: '',
  launchRole: '',
  quickActor: '',
  quickMode: LAUNCH_PARAMS.get('modo') === 'nfc',
  pendingFrameAction: LAUNCH_PARAMS.get('item') ? 'open-item' : LAUNCH_PARAMS.get('view') === 'pending' ? 'open-pending' : '',
  pendingItemId: LAUNCH_PARAMS.get('item') || '',
  pendingDataRefresh: false,
  pendingRefreshItemId: '',
  installPrompt: null,
  setupMode: 'claim',
  pendingSetup: null,
  bridgeWaiters: [],
  ownerSyncing: false,
  sessionReady: false,
  pendingOpenOptions: null
};

const els = {
  frame: document.querySelector('#homeApp'),
  setupView: document.querySelector('#setupView'),
  quickView: document.querySelector('#quickView'),
  quickAvatar: document.querySelector('#quickAvatar'),
  quickGreeting: document.querySelector('#quickGreeting'),
  quickDescription: document.querySelector('#quickDescription'),
  quickAddButton: document.querySelector('#quickAddButton'),
  quickOpenButton: document.querySelector('#quickOpenButton'),
  quickChangeActor: document.querySelector('#quickChangeActor'),
  quickActorChooser: document.querySelector('#quickActorChooser'),
  quickPeopleOptions: document.querySelector('#quickPeopleOptions'),
  loadingState: document.querySelector('#loadingState'),
  setupForm: document.querySelector('#setupForm'),
  successState: document.querySelector('#successState'),
  setupKicker: document.querySelector('#setupKicker'),
  setupTitle: document.querySelector('#setupTitle'),
  setupDescription: document.querySelector('#setupDescription'),
  appUrlField: document.querySelector('#appUrlField'),
  appUrl: document.querySelector('#appUrl'),
  peopleOptions: document.querySelector('#peopleOptions'),
  pinLabel: document.querySelector('#pinLabel'),
  pinHelp: document.querySelector('#pinHelp'),
  housePin: document.querySelector('#housePin'),
  confirmPinField: document.querySelector('#confirmPinField'),
  confirmPin: document.querySelector('#confirmPin'),
  formError: document.querySelector('#formError'),
  activateButton: document.querySelector('#activateButton'),
  continueButton: document.querySelector('#continueButton'),
  successTitle: document.querySelector('#successTitle'),
  successDescription: document.querySelector('#successDescription'),
  installInstructions: document.querySelector('#installInstructions'),
  installButton: document.querySelector('#installButton'),
  openButton: document.querySelector('#openButton'),
  installBanner: document.querySelector('#installBanner'),
  bannerInstallButton: document.querySelector('#bannerInstallButton'),
  dismissInstallButton: document.querySelector('#dismissInstallButton'),
  toast: document.querySelector('#globalToast')
};

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  state.installPrompt = event;
  updateInstallUi();
});

window.addEventListener('appinstalled', () => {
  state.installPrompt = null;
  els.installBanner.hidden = true;
  showToast('Casa en Orden quedó instalada.');
});

window.addEventListener('message', handleFrameMessage);
document.addEventListener('DOMContentLoaded', init);

async function init() {
  bindEvents();
  primeCachedSession();
  if (state.quickMode && state.device) showQuickView();

  const registrationPromise = registerServiceWorker()
    .then(registration => {
      state.registration = registration;
      return registration;
    })
    .catch(error => {
      console.warn('El service worker todavía no está listo.', error);
      return null;
    });

  try {
    if (state.device) {
      state.actor = state.device.actor || state.actor || 'Axel';
      state.ownerRole = state.device.ownerRole || state.ownerRole || roleForActor(state.actor);
    }

    const [remoteConfig, restored] = await Promise.all([
      api('/api/config'),
      state.device ? restoreDevice() : Promise.resolve(null)
    ]);
    state.config = { ...(state.config || {}), ...remoteConfig };
    renderPeople(state.config.people);

    if (!state.config.claimed) {
      clearStoredDevice();
      showSetup('claim');
      return;
    }
    if (!state.device) {
      showSetup('join');
      return;
    }

    if (!restored) {
      clearStoredDevice();
      showSetup('join');
      return;
    }
    acceptRegistration(restored);
    state.sessionReady = true;

    if (!('Notification' in window) || Notification.permission === 'denied' || !restored.notificationsActive) {
      showSetup('repair');
      els.continueButton.hidden = false;
      return;
    }
    state.forceActorOnce = true;
    state.launchActor = state.actor;
    if (state.quickMode) showQuickView();
    else openApp({ actor: state.actor, action: state.pendingFrameAction, itemId: state.pendingItemId });
    flushPendingOpen();
  } catch (error) {
    showFatal(errorMessage(error));
  }

  registrationPromise.then(registration => {
    if (!registration || !state.device || Notification.permission !== 'granted') return;
    refreshStoredSubscription().catch(error => console.warn('No se pudo actualizar la suscripción en segundo plano.', error));
  });
}

function bindEvents() {
  els.setupForm.addEventListener('submit', event => {
    event.preventDefault();
    startActivation(true);
  });
  els.continueButton.addEventListener('click', () => startActivation(false));
  els.peopleOptions.addEventListener('click', event => {
    const button = event.target.closest('[data-person]');
    if (!button) return;
    state.actor = button.dataset.person;
    state.ownerRole = roleForActor(state.actor, state.config?.people);
    renderPeople(state.config && state.config.people);
  });
  els.quickPeopleOptions.addEventListener('click', event => {
    const button = event.target.closest('[data-quick-person]');
    if (!button) return;
    state.quickActor = button.dataset.quickPerson;
    renderQuickIdentity();
  });
  els.quickChangeActor.addEventListener('click', () => {
    if (state.quickActor && state.quickActor !== state.actor) {
      state.quickActor = state.actor;
      els.quickActorChooser.hidden = true;
      renderQuickIdentity();
      return;
    }
    els.quickActorChooser.hidden = !els.quickActorChooser.hidden;
  });
  els.quickAddButton.addEventListener('click', () => requestOpenApp({ actor: state.quickActor || state.actor, action: 'add' }));
  els.quickOpenButton.addEventListener('click', () => requestOpenApp({ actor: state.quickActor || state.actor }));
  document.querySelector('[data-toggle-pin]').addEventListener('click', togglePinVisibility);
  els.installButton.addEventListener('click', requestInstall);
  els.bannerInstallButton.addEventListener('click', requestInstall);
  els.dismissInstallButton.addEventListener('click', () => {
    localStorage.setItem(STORAGE_INSTALL_DISMISSED, '1');
    els.installBanner.hidden = true;
  });
  els.openButton.addEventListener('click', () => {
    if (state.quickMode) showQuickView();
    else openApp({ actor: state.actor });
  });
  els.frame.addEventListener('load', () => {
    setTimeout(configureFrame, 250);
    setTimeout(configureFrame, 1200);
  });
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
}

async function restoreDevice() {
  try {
    const result = await api('/api/register', {
      method: 'POST',
      body: {
        actor: state.actor,
        ownerRole: state.ownerRole || state.device?.ownerRole || roleForActor(state.actor),
        deviceId: state.device.id,
        deviceSecret: state.device.secret
      }
    });
    return result;
  } catch (error) {
    if (error.code === 'PIN_INVALID' || error.code === 'PIN_INCORRECT' || error.code === 'DEVICE_UNAUTHORIZED') return null;
    throw error;
  }
}

async function refreshStoredSubscription() {
  if (!state.registration || !state.device || Notification.permission !== 'granted') return;
  const subscription = await currentOrNewSubscription();
  const result = await api('/api/register', {
    method: 'POST',
    body: {
      actor: state.actor,
      ownerRole: state.ownerRole || state.device.ownerRole,
      deviceId: state.device.id,
      deviceSecret: state.device.secret,
      subscription
    }
  });
  acceptRegistration(result);
}

function showSetup(mode) {
  state.setupMode = mode;
  els.loadingState.hidden = true;
  els.successState.hidden = true;
  els.setupForm.hidden = false;
  els.setupView.hidden = false;
  els.quickView.hidden = true;
  els.frame.hidden = true;
  els.formError.hidden = true;
  els.continueButton.hidden = mode !== 'repair';

  const isClaim = mode === 'claim';
  const isRepair = mode === 'repair';
  els.appUrlField.hidden = !isClaim;
  els.appUrl.required = isClaim;
  els.confirmPinField.hidden = !isClaim;
  els.confirmPin.required = isClaim;
  els.housePin.required = !isRepair;
  els.housePin.value = '';
  els.confirmPin.value = '';
  els.housePin.autocomplete = isClaim ? 'new-password' : 'current-password';

  if (isClaim) {
    els.setupKicker.textContent = 'Primera configuración';
    els.setupTitle.textContent = 'Conecta tu hogar';
    els.setupDescription.textContent = 'Pega la URL que ya tienes, crea un PIN compartido y activa este teléfono.';
    els.pinLabel.textContent = 'Crea un PIN para el hogar';
    els.pinHelp.textContent = 'Axel y Laura usarán el mismo PIN al vincular sus teléfonos.';
    els.activateButton.querySelector('span').textContent = 'Crear hogar y activar';
  } else if (isRepair) {
    els.setupKicker.textContent = 'Configuración del teléfono';
    els.setupTitle.textContent = 'Confirma de quién es';
    els.setupDescription.textContent = 'Puedes corregir el dueño permanente de este teléfono y volver a activar sus avisos.';
    els.pinLabel.textContent = 'PIN del hogar';
    els.pinHelp.textContent = 'No es necesario si este teléfono ya estaba vinculado.';
    els.activateButton.querySelector('span').textContent = 'Volver a activar avisos';
  } else {
    els.setupKicker.textContent = 'Nuevo teléfono';
    els.setupTitle.textContent = 'Vincula este teléfono';
    els.setupDescription.textContent = 'Elige de quién es este teléfono y escribe el PIN que crearon en el primer dispositivo.';
    els.pinLabel.textContent = 'PIN del hogar';
    els.pinHelp.textContent = 'Usa exactamente el mismo PIN del primer teléfono.';
    els.activateButton.querySelector('span').textContent = 'Vincular y activar';
  }

  if (!state.actor) state.actor = state.device?.actor || state.config?.people?.[0] || 'Axel';
  renderPeople(state.config && state.config.people);
}

async function startActivation(withNotifications) {
  clearError();
  setBusy(true);
  try {
    const values = collectSetupValues();
    state.pendingSetup = values;
    let subscription = null;
    if (withNotifications) {
      subscription = await requestPushSubscription();
    }
    await completeRegistration(values, subscription);
  } catch (error) {
    showFormError(errorMessage(error));
    if (error.code === 'NOTIFICATIONS_DENIED' || error.code === 'PUSH_UNAVAILABLE') {
      els.continueButton.hidden = false;
    }
  } finally {
    setBusy(false);
  }
}

function collectSetupValues() {
  const isClaim = state.setupMode === 'claim';
  const pin = els.housePin.value.trim();
  if (!state.actor) throw localError('Elige de quién es este teléfono.');
  if (isClaim && pin !== els.confirmPin.value.trim()) throw localError('Los dos campos del PIN no coinciden.');
  if (!state.device && pin.length < 6) throw localError('Escribe un PIN de al menos 6 caracteres.');
  return {
    actor: state.actor,
    ownerRole: roleForActor(state.actor, state.config?.people),
    pin,
    appUrl: isClaim ? els.appUrl.value.trim() : ''
  };
}

async function completeRegistration(values, subscription) {
  const body = {
    actor: values.actor,
    ownerRole: values.ownerRole,
    pin: state.device ? undefined : values.pin,
    appUrl: state.setupMode === 'claim' ? values.appUrl : undefined,
    deviceId: state.device?.id,
    deviceSecret: state.device?.secret,
    subscription
  };
  const result = await api('/api/register', { method: 'POST', body });
  acceptRegistration(result);
  state.config.claimed = true;
  state.config.appUrl = result.appUrl;
  setFrameUrl(result.appUrl);
  state.forceActorOnce = true;
  configureFrame();

  let pushWorked = Boolean(subscription);
  if (subscription) {
    try {
      await api('/api/test', {
        method: 'POST',
        body: { deviceId: state.device.id, deviceSecret: state.device.secret }
      });
    } catch (error) {
      console.warn('La prueba Web Push no pudo completarse.', error);
      pushWorked = false;
    }
  }

  const bridgeWorked = await waitForBridge(14000);
  showSuccess({ pushWorked, bridgeWorked });
}

function acceptRegistration(result) {
  state.actor = result.actor;
  state.ownerRole = result.ownerRole || state.ownerRole || roleForActor(result.actor, state.config?.people);
  state.bridge = {
    notifyUrl: result.notifyUrl,
    notifySecret: result.bridgeSecret,
    appAccessToken: result.appAccessToken
  };
  state.device = {
    id: result.deviceId,
    secret: result.deviceSecret,
    actor: result.actor,
    ownerRole: state.ownerRole,
    appUrl: result.appUrl || state.config?.appUrl || state.device?.appUrl || '',
    notifyUrl: result.notifyUrl,
    notifySecret: result.bridgeSecret,
    appAccessToken: result.appAccessToken,
    people: state.config?.people || state.device?.people || []
  };
  if (result.appUrl) {
    if (!state.config) state.config = { claimed: true, people: state.device.people };
    state.config.appUrl = result.appUrl;
    setFrameUrl(result.appUrl);
  }
  localStorage.setItem(STORAGE_DEVICE, JSON.stringify(state.device));
}

function primeCachedSession() {
  if (!state.device) return false;
  state.actor = state.device.actor || 'Axel';
  state.ownerRole = state.device.ownerRole || roleForActor(state.actor, state.device.people);
  const hasBridge = state.device.appUrl && state.device.notifyUrl && state.device.notifySecret && state.device.appAccessToken;
  if (!hasBridge) return false;
  state.config = {
    claimed: true,
    appUrl: state.device.appUrl,
    people: Array.isArray(state.device.people) && state.device.people.length ? state.device.people : [state.actor]
  };
  state.bridge = {
    notifyUrl: state.device.notifyUrl,
    notifySecret: state.device.notifySecret,
    appAccessToken: state.device.appAccessToken
  };
  state.sessionReady = true;
  setFrameUrl(state.device.appUrl);
  return true;
}

async function requestPushSubscription() {
  if (!('Notification' in window) || !('PushManager' in window) || !state.registration) {
    const error = localError('Este navegador no admite notificaciones Web Push. Puedes entrar sin avisos.');
    error.code = 'PUSH_UNAVAILABLE';
    throw error;
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    const error = localError('El permiso no quedó activado. Habilita las notificaciones del sitio o entra sin avisos.');
    error.code = 'NOTIFICATIONS_DENIED';
    throw error;
  }
  return currentOrNewSubscription();
}

async function currentOrNewSubscription() {
  let existing = await state.registration.pushManager.getSubscription();
  const expectedKey = base64UrlToUint8Array(state.config.vapidPublicKey);
  if (existing && existing.options && existing.options.applicationServerKey) {
    const currentKey = new Uint8Array(existing.options.applicationServerKey);
    const sameKey = currentKey.length === expectedKey.length && currentKey.every((value, index) => value === expectedKey[index]);
    if (!sameKey) {
      await existing.unsubscribe();
      existing = null;
    }
  }
  if (existing) return existing.toJSON();
  const subscription = await state.registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: expectedKey
  });
  return subscription.toJSON();
}

function setFrameUrl(url) {
  if (!url) return;
  const target = new URL(url);
  target.searchParams.set('pwaChannel', state.frameChannel);
  const bootstrap = {
    channel: state.frameChannel,
    notifyUrl: state.bridge?.notifyUrl || '',
    notifySecret: state.bridge?.notifySecret || '',
    appAccessToken: state.bridge?.appAccessToken || '',
    deviceId: state.device?.id || '',
    deviceOwner: state.actor || '',
    deviceOwnerRole: state.ownerRole || '',
    pwaUrl: location.origin
  };
  const fragment = new URLSearchParams();
  fragment.set('ceBridge', JSON.stringify(bootstrap));
  target.hash = fragment.toString();
  const value = target.toString();
  if (els.frame.src !== value) els.frame.src = value;
}

function openApp(options = {}) {
  if (!state.config?.appUrl) return;
  state.launchActor = options.actor || state.actor;
  state.launchRole = roleForActor(state.launchActor, state.config?.people);
  state.forceActorOnce = true;
  if (options.action !== undefined) state.pendingFrameAction = options.action || '';
  if (options.itemId !== undefined) state.pendingItemId = options.itemId || '';
  setFrameUrl(state.config.appUrl);
  els.setupView.hidden = true;
  els.quickView.hidden = true;
  els.frame.hidden = false;
  configureFrame();
  if (state.frameReady && state.launchActor) {
    postToFrame({ type: 'casa-en-orden:set-actor', actor: state.launchActor });
    dispatchPendingFrameAction();
  }
  updateInstallUi();
}

function requestOpenApp(options = {}) {
  if (!state.sessionReady || !state.config?.appUrl || !state.bridge) {
    state.pendingOpenOptions = options;
    showToast('Conectando con tu hogar…', 2400);
    return;
  }
  state.pendingOpenOptions = null;
  openApp(options);
}

function flushPendingOpen() {
  if (!state.pendingOpenOptions || !state.sessionReady || !state.config?.appUrl || !state.bridge) return;
  const options = state.pendingOpenOptions;
  state.pendingOpenOptions = null;
  openApp(options);
}

function showQuickView() {
  state.quickActor = state.actor;
  els.setupView.hidden = true;
  els.frame.hidden = true;
  els.quickView.hidden = false;
  els.quickActorChooser.hidden = true;
  renderQuickIdentity();
  updateInstallUi();
}

function renderQuickIdentity() {
  const people = state.config?.people || ['Axel', 'Laura'];
  const actor = state.quickActor || state.actor || people[0] || 'Axel';
  const isSecond = people.indexOf(actor) === 1;
  els.quickAvatar.textContent = initials(actor);
  els.quickAvatar.classList.toggle('is-second', isSecond);
  els.quickGreeting.textContent = `Hola, ${firstName(actor)}`;
  els.quickDescription.textContent = '¿Qué quieres hacer?';
  els.quickChangeActor.textContent = actor === state.actor ? `No soy ${firstName(state.actor)}` : `Usar como ${firstName(state.actor)}`;
  renderQuickPeople(people);
}

function renderQuickPeople(people) {
  const cleanPeople = [...new Set((people || []).filter(Boolean))].slice(0, 4);
  els.quickPeopleOptions.innerHTML = cleanPeople.map(name => {
    const selected = name === state.quickActor ? ' is-selected' : '';
    return `<button class="person-option${selected}" type="button" data-quick-person="${escapeAttribute(name)}"><span class="mini-avatar">${escapeHtml(initials(name))}</span><strong>${escapeHtml(name)}</strong></button>`;
  }).join('');
}

function showSuccess({ pushWorked, bridgeWorked }) {
  els.setupForm.hidden = true;
  els.loadingState.hidden = true;
  els.successState.hidden = false;
  els.setupView.hidden = false;
  els.frame.hidden = true;
  if (pushWorked && bridgeWorked) {
    els.successTitle.textContent = '¡Todo listo!';
    els.successDescription.textContent = 'La app quedó conectada y acabamos de enviarte una notificación de prueba.';
  } else if (!pushWorked) {
    els.successTitle.textContent = 'App conectada';
    els.successDescription.textContent = 'Puedes usarla normalmente. Los avisos de este teléfono siguen desactivados por ahora.';
  } else {
    els.successTitle.textContent = 'Teléfono vinculado';
    els.successDescription.textContent = 'Los avisos del teléfono funcionan. Abre la app para terminar de enlazar Apps Script automáticamente.';
  }
  updateInstallUi();
}

function handleFrameMessage(event) {
  if (!event.data || typeof event.data !== 'object' || event.data.channel !== state.frameChannel) return;
  const data = event.data;
  state.frameMessenger = event.source;
  if (data.type === 'casa-en-orden:generate-product-image') {
    generateProductImageForFrame(data);
    return;
  }
  if (data.type === 'casa-en-orden:state') {
    state.frameReady = true;
    if (Array.isArray(data.people) && data.people.length) {
      state.config.people = data.people;
      const currentOwnerName = actorForRole(state.ownerRole, data.people);
      if (currentOwnerName) {
        const ownerChanged = state.actor !== currentOwnerName;
        state.actor = currentOwnerName;
        if (state.device) {
          state.device.actor = currentOwnerName;
          state.device.ownerRole = state.ownerRole;
          localStorage.setItem(STORAGE_DEVICE, JSON.stringify(state.device));
        }
        if (ownerChanged) syncDeviceOwnerName(currentOwnerName);
      }
      const currentLaunchName = actorForRole(state.launchRole || state.ownerRole, data.people);
      if (currentLaunchName) state.launchActor = currentLaunchName;
      renderPeople(data.people);
    }
    if (data.homeName) document.title = data.homeName;
    if (state.forceActorOnce && state.launchActor) {
      if (data.actor !== state.launchActor) {
        postToFrame({ type: 'casa-en-orden:set-actor', actor: state.launchActor });
      } else {
        state.forceActorOnce = false;
        dispatchPendingFrameAction();
      }
    } else {
      dispatchPendingFrameAction();
    }
    configureFrame();
    dispatchPendingDataRefresh();
  }
  if (data.type === 'casa-en-orden:shell-ready') {
    state.frameReady = true;
    configureFrame();
    dispatchPendingFrameAction();
    dispatchPendingDataRefresh();
  }
  if (data.type === 'casa-en-orden:bridge-result') {
    const ok = Boolean(data.ok);
    state.bridgeWaiters.splice(0).forEach(resolve => resolve(ok));
    if (!ok && data.error) console.warn('Apps Script no aceptó el puente Web Push.', data.error);
  }
  if (data.type === 'casa-en-orden:open-notification-settings') {
    showSetup('repair');
  }
}

async function generateProductImageForFrame(data) {
  const requestId = String(data.requestId || '');
  if (!requestId) return;
  try {
    if (!state.device) throw localError('Este teléfono debe estar vinculado antes de crear imágenes.');
    const result = await api('/api/catalog-image', {
      method: 'POST',
      timeoutMs: 45000,
      body: {
        name: String(data.name || ''),
        deviceId: state.device.id,
        deviceSecret: state.device.secret
      }
    });
    postToFrame({
      type: 'casa-en-orden:product-image-result',
      requestId,
      ok: true,
      dataUrl: result.dataUrl,
      filename: result.filename
    });
  } catch (error) {
    postToFrame({
      type: 'casa-en-orden:product-image-result',
      requestId,
      ok: false,
      error: errorMessage(error)
    });
  }
}

function configureFrame() {
  if (!state.bridge || !els.frame.contentWindow) return;
  postToFrame({
    type: 'casa-en-orden:configure-push-bridge',
    notifyUrl: state.bridge.notifyUrl,
    notifySecret: state.bridge.notifySecret,
    appAccessToken: state.bridge.appAccessToken,
    deviceId: state.device?.id || '',
    deviceOwner: state.actor,
    deviceOwnerRole: state.ownerRole,
    pwaUrl: location.origin
  });
}

function dispatchPendingFrameAction() {
  const action = state.pendingFrameAction;
  if (!action) return;
  state.pendingFrameAction = '';
  if (action === 'add') postToFrame({
    type: 'casa-en-orden:open-new-item',
    actor: state.launchActor || state.actor,
    people: state.config?.people || [],
    homeName: document.title || 'Casa en Orden'
  });
  if (action === 'open-item') postToFrame({ type: 'casa-en-orden:open-item', itemId: state.pendingItemId });
  if (action === 'open-pending') postToFrame({ type: 'casa-en-orden:open-view', view: 'pending' });
  state.pendingItemId = '';
}

function postToFrame(message) {
  const target = state.frameMessenger || els.frame.contentWindow;
  if (target) target.postMessage({ ...message, channel: state.frameChannel }, '*');
}

function waitForBridge(timeoutMs) {
  if (!state.bridge) return Promise.resolve(false);
  configureFrame();
  return new Promise(resolve => {
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    state.bridgeWaiters.push(finish);
    const timer = setTimeout(() => finish(false), timeoutMs);
  });
}

function handleServiceWorkerMessage(event) {
  const data = event.data;
  if (!data || data.type !== 'casa-en-orden:data-changed') return;
  state.pendingDataRefresh = true;
  state.pendingRefreshItemId = data.itemId || state.pendingRefreshItemId;
  dispatchPendingDataRefresh();
}

function dispatchPendingDataRefresh() {
  if (!state.pendingDataRefresh || !state.frameReady) return;
  state.pendingDataRefresh = false;
  postToFrame({ type: 'casa-en-orden:refresh', itemId: state.pendingRefreshItemId || '' });
  state.pendingRefreshItemId = '';
}

async function syncDeviceOwnerName(actor) {
  if (!state.device || state.ownerSyncing) return;
  state.ownerSyncing = true;
  try {
    const subscription = 'Notification' in window && Notification.permission === 'granted' && state.registration
      ? await state.registration.pushManager.getSubscription()
      : null;
    const result = await api('/api/register', {
      method: 'POST',
      body: {
        actor,
        ownerRole: state.ownerRole,
        deviceId: state.device.id,
        deviceSecret: state.device.secret,
        subscription: subscription ? subscription.toJSON() : null
      }
    });
    acceptRegistration(result);
  } catch (error) {
    console.warn('No se pudo sincronizar el nombre del dueño del teléfono.', error);
  } finally {
    state.ownerSyncing = false;
  }
}

function renderPeople(people = ['Axel', 'Laura']) {
  const cleanPeople = [...new Set((people || []).filter(Boolean))];
  if (!cleanPeople.length) cleanPeople.push('Axel', 'Laura');
  if (!cleanPeople.includes(state.actor)) state.actor = actorForRole(state.ownerRole, cleanPeople) || cleanPeople[0];
  els.peopleOptions.innerHTML = cleanPeople.slice(0, 4).map(name => {
    const selected = name === state.actor ? ' is-selected' : '';
    return `<button class="person-option${selected}" type="button" data-person="${escapeAttribute(name)}"><span class="mini-avatar">${escapeHtml(initials(name))}</span><strong>${escapeHtml(name)}</strong></button>`;
  }).join('');
  if (els.quickView && !els.quickView.hidden) renderQuickIdentity();
}

function updateInstallUi() {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  els.installButton.hidden = !state.installPrompt || standalone;
  els.installInstructions.textContent = state.installPrompt
    ? 'Toca “Instalar” y aparecerá en tu pantalla de inicio.'
    : 'En Chrome o Samsung Internet, abre el menú ⋮ y elige “Agregar a pantalla de inicio”.';
  const dismissed = localStorage.getItem(STORAGE_INSTALL_DISMISSED) === '1';
  els.installBanner.hidden = standalone || dismissed || !els.setupView.hidden || !els.quickView.hidden;
}

async function requestInstall() {
  if (!state.installPrompt) {
    showToast('Abre el menú ⋮ y toca “Agregar a pantalla de inicio”.', 5200);
    return;
  }
  const prompt = state.installPrompt;
  state.installPrompt = null;
  await prompt.prompt();
  await prompt.userChoice;
  updateInstallUi();
}

function togglePinVisibility(event) {
  const visible = els.housePin.type === 'text';
  els.housePin.type = visible ? 'password' : 'text';
  if (!els.confirmPinField.hidden) els.confirmPin.type = visible ? 'password' : 'text';
  event.currentTarget.textContent = visible ? 'Ver' : 'Ocultar';
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise(resolve => setTimeout(() => resolve(registration), 5000))
  ]);
}

async function api(path, options = {}) {
  const init = { method: options.method || 'GET', headers: { Accept: 'application/json' } };
  if (options.body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(options.timeoutMs) || 12000);
  init.signal = controller.signal;
  let response;
  try {
    response = await fetch(path, init);
  } catch (error) {
    if (error && error.name === 'AbortError') throw localError('La conexión está tardando demasiado. Verifica tu internet y vuelve a intentar.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw localError('El servidor devolvió una respuesta inesperada.');
  }
  if (!response.ok || !payload.ok) {
    const error = localError(payload.error || 'No se pudo completar la solicitud.');
    error.code = payload.code || 'REQUEST_ERROR';
    throw error;
  }
  return payload;
}

function base64UrlToUint8Array(value) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(character => character.charCodeAt(0)));
}

function readStoredDevice() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_DEVICE));
    return value && value.id && value.secret ? value : null;
  } catch {
    return null;
  }
}

function clearStoredDevice() {
  state.device = null;
  localStorage.removeItem(STORAGE_DEVICE);
}

function setBusy(busy) {
  els.activateButton.disabled = busy;
  els.continueButton.disabled = busy;
  els.activateButton.querySelector('span').textContent = busy ? 'Conectando…' : activationLabel();
}

function activationLabel() {
  if (state.setupMode === 'claim') return 'Crear hogar y activar';
  if (state.setupMode === 'repair') return 'Volver a activar avisos';
  return 'Vincular y activar';
}

function showFatal(message) {
  els.setupView.hidden = false;
  els.quickView.hidden = true;
  els.frame.hidden = true;
  els.loadingState.hidden = false;
  els.loadingState.innerHTML = `<div><strong>No pudimos iniciar la app</strong><small>${escapeHtml(message)}</small><button class="text-button" type="button" data-retry>Volver a intentar</button></div>`;
  els.loadingState.querySelector('[data-retry]').addEventListener('click', () => location.reload());
}

function showFormError(message) {
  els.formError.textContent = message;
  els.formError.hidden = false;
}

function clearError() {
  els.formError.hidden = true;
  els.formError.textContent = '';
}

function showToast(message, duration = 3200) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { els.toast.hidden = true; }, duration);
}

function localError(message) {
  return new Error(message);
}

function errorMessage(error) {
  return error && error.message ? error.message : 'Ocurrió un error inesperado.';
}

function initials(name) {
  return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
}

function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || 'Hola';
}

function roleForActor(actor, people = ['Axel', 'Laura']) {
  const index = (people || []).findIndex(name => String(name || '').toLocaleLowerCase('es') === String(actor || '').toLocaleLowerCase('es'));
  return index === 1 ? 'person2' : 'person1';
}

function actorForRole(role, people = ['Axel', 'Laura']) {
  const index = role === 'person2' ? 1 : 0;
  return people && people[index] ? people[index] : '';
}

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}
