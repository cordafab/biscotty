import { createConfiguration } from '../configuration/service.js';
import { createBurner } from '../burner/service.js';
import { createViews } from '../firefox/views.js';
import { createObservations } from '../firefox/observations.js';
import { createTransfer } from '../transfer/service.js';
import { createHandles } from './handles.js';
import { createGateway } from './gateway.js';
export function createApplication(adapter, { extensionId, baseURL }) {
  const handles = createHandles();
  const siteHandles = createHandles({ limit: 16384 });
  let sequence = 0;
  let burner;
  const emit = reason => {
    if (reason === 'configuration' || reason === 'stores') { siteHandles.invalidate(); handles.invalidate('burn'); handles.invalidate('site'); handles.invalidate('sitePage'); handles.invalidate('cookies'); handles.invalidate('inventoryPlan'); handles.invalidate('import'); handles.invalidate('importPlan'); }
    adapter.broadcast?.({ type: 'stateChanged', sequence: ++sequence, reason });
  };
  const observations = createObservations({ adapter, onInvalidate: () => { emit('siteContext'); } });
  const configuration = createConfiguration({ adapter, emit, isLocked: () => burner?.isLocked() ?? false });
  burner = createBurner({ adapter, configuration, handles, emit });
  const transfer = createTransfer({ adapter, configuration, handles, emit, isLocked: burner.isLocked });
  const views = createViews({ adapter, configuration, burner, handles, siteHandles, observations });
  let ready = Promise.all([configuration.initialize(), burner.initialize(), observations.ready]);
  async function getState() {
    let catalogAvailable = true;
    try { if (!burner.isLocked()) await configuration.reconcileCatalog(await adapter.getCatalog()); else await adapter.getCatalog(); }
    catch { catalogAvailable = false; }
    const state = await configuration.view();
    const access = await adapter.getAccess();
    const valid = state.configurationStatus === 'valid';
    const recovery = ['missing','invalid'].includes(state.configurationStatus) && Boolean(state.recoveryToken);
    const reason = !valid ? 'Restore the saved configuration before burning cookies.' : !access.granted || !access.available ? access.reason : !catalogAvailable ? 'Firefox containers are unavailable. Enable containers and try again.' : burner.isLocked() ? 'A burn is running or an interruption needs acknowledgment.' : '';
    return { ...state, operation: burner.view(), capabilities: { canBurn: valid && access.granted && access.available && catalogAvailable && !burner.isLocked(), canChangeProtection: valid && access.granted && access.available && catalogAvailable && !burner.isLocked(), canReadCookies: valid && access.granted && access.available && catalogAvailable, canRecoverConfiguration: recovery && catalogAvailable && !burner.isLocked(), reason } };
  }
  const handlers = { ...configuration.handlers, ...burner.handlers, ...views.handlers, ...transfer.handlers, getState, openOptions: async () => { await adapter.openOptions(); return { opened: true }; }, requestHostAccess: async () => ({ granted: (await adapter.getAccess()).granted, guidance: 'Use Restore website access from a Biscotty button or Firefox Add-ons permissions.' }) };
  const dispatch = createGateway({ extensionId, baseURL, handlers: Object.fromEntries(Object.entries(handlers).map(([name, handler]) => [name, async (...args) => { await ready; return handler(...args); }])) });
  adapter.onEnvironmentChange?.(() => {
    burner.invalidate(); handles.invalidate(); siteHandles.invalidate(); emit('capabilities');
    adapter.getAccess().then(access => { if (!access.granted || !access.available) return observations.invalidate(); }).catch(() => observations.invalidate());
    if (!burner.isLocked()) configuration.reconcileCatalog().catch(() => {});
  });
  return { dispatch, configuration, burner, ready: () => ready, installed(reason) {
    if (reason === 'install') ready = ready.then(() => configuration.initialize({ firstInstall: true }));
    return ready;
  } };
}
