import { createSessionManager } from './session-manager.js';
import { createDurableSessionRegistry } from './session-registry-store.js';
import { createWhatsAppSessionRuntime } from './whatsapp-session-runtime.js';

/**
 * Composes encrypted registry persistence, the session coordinator and the
 * independent Baileys runtime. This is an integration boundary for the host;
 * it does not start sessions until initialize() and startRestored() are called.
 */
export function createMultiSessionService({
  createStore,
  registryDirectory = './.mhe-session-registry',
  sessionDirectory = './sessions',
  maxSessions = 50,
  logger = console,
  ...runtimeDependencies
} = {}) {
  if (typeof createStore !== 'function') throw new TypeError('createStore is required.');

  const registryStore = createStore({ prefix: 'mhe/registry/' });
  const registry = createDurableSessionRegistry({
    store: registryStore,
    directory: registryDirectory,
    maxSessions,
    logger,
  });

  let manager;
  let runtime;
  let initialized = false;

  async function initialize() {
    if (initialized) throw new Error('M.H.E multi-session service is already initialized.');
    const restored = await registry.load();
    initialized = true;
    if (!restored.enabled) {
      return { enabled: false, reason: 'encrypted-registry-storage-required', sessions: [] };
    }

    manager = createSessionManager({
      maxSessions,
      initialSessions: restored.sessions,
      persist: (snapshot) => registry.persist(snapshot),
    });
    runtime = createWhatsAppSessionRuntime({
      ...runtimeDependencies,
      sessionManager: manager,
      createStore,
      rootDirectory: sessionDirectory,
      logger,
    });
    return { enabled: true, sessions: manager.list() };
  }

  async function startRestored() {
    if (!initialized) throw new Error('Initialize M.H.E multi-session service before starting sessions.');
    if (!runtime) return [];
    const records = manager.list().filter((item) => item.state !== 'logged_out');
    const results = await Promise.allSettled(records.map((item) => runtime.startExisting(item.id)));
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        logger.error?.({ err: result.reason, sessionId: records[index].id }, 'Restored WhatsApp session could not start');
      }
    });
    return results;
  }

  return Object.freeze({
    initialize,
    startRestored,
    get runtime() { return runtime || null; },
    get sessionManager() { return manager || null; },
    get enabled() { return Boolean(runtime); },
  });
}
