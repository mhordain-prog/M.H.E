import fs from 'node:fs/promises';
import path from 'node:path';
import { bindSessionEvent } from './session-context.js';

/**
 * Owns independent Baileys sockets and auth directories.
 * The host supplies durable session metadata and one encrypted store per ID.
 */
export function createWhatsAppSessionRuntime({
  sessionManager,
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  disconnectReason = {},
  rootDirectory = './sessions',
  createStore,
  onSocket = () => {},
  logger = console,
  socketOptions = {},
  openTimeoutMs = 60_000,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
} = {}) {
  if (!sessionManager || typeof sessionManager.create !== 'function') throw new TypeError('sessionManager is required.');
  if (typeof makeWASocket !== 'function' || typeof useMultiFileAuthState !== 'function') throw new TypeError('Baileys socket and auth functions are required.');
  if (typeof fetchLatestBaileysVersion !== 'function' || typeof createStore !== 'function') throw new TypeError('Version and encrypted-store factories are required.');
  const runtimes = new Map();
  const starts = new Map();

  function directoryFor(id) {
    if (!/^[a-zA-Z0-9-]{8,80}$/.test(id)) throw new TypeError('Invalid session identifier.');
    return path.join(rootDirectory, id);
  }

  async function createSocket(record) {
    const directory = directoryFor(record.id);
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const store = createStore({ prefix: `mhe/sessions/${record.id}/` });
    const restored = await store.restore(directory);
    const auth = await useMultiFileAuthState(directory);
    const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));
    const context = { id: record.id, isPrimary: record.isPrimary, settings: {} };
    const socket = makeWASocket({
      ...socketOptions,
      auth: auth.state,
      version,
      printQRInTerminal: false,
      markOnlineOnConnect: false,
    });
    const runtime = { id: record.id, numberRegistered: Boolean(auth.state?.creds?.registered), directory, store, auth, socket, context, reconnectTimer: null, closed: false };
    runtimes.set(record.id, runtime);

    bindSessionEvent(socket, 'creds.update', async (...args) => {
      await auth.saveCreds(...args);
      try { await store.sync(directory); }
      catch (error) { logger.error?.({ err: error, sessionId: record.id }, 'WhatsApp session backup failed'); }
    }, context);

    bindSessionEvent(socket, 'connection.update', async ({ connection, lastDisconnect }) => {
      if (connection === 'open') {
        await sessionManager.setState(record.id, 'connected', { activity: true });
        runtime.numberRegistered = true;
        logger.info?.({ sessionId: record.id, restored: restored.restored || 0 }, 'WhatsApp session connected');
      }
      if (connection === 'close' && !runtime.closed) {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        if (statusCode === disconnectReason.loggedOut) {
          await sessionManager.setState(record.id, 'logged_out').catch((error) => logger.warn?.({ err: error, sessionId: record.id }, 'Could not mark session logged out'));
          runtimes.delete(record.id);
          runtime.closed = true;
          return;
        }
        await sessionManager.setState(record.id, 'reconnecting').catch(() => {});
        runtime.reconnectTimer = setTimeoutFn(async () => {
          runtimes.delete(record.id);
          await startExisting(record.id).catch((error) => logger.error?.({ err: error, sessionId: record.id }, 'WhatsApp session reconnect failed'));
        }, 3000);
        runtime.reconnectTimer?.unref?.();
      }
    }, context);

    await onSocket(socket, context, runtime);
    return runtime;
  }

  async function startExisting(id) {
    if (runtimes.has(id)) return runtimes.get(id);
    if (starts.has(id)) return starts.get(id);
    const record = sessionManager.get(id);
    if (!record) throw new Error('Session M.H.E introuvable.');
    const task = (async () => {
      if (record.state === 'logged_out') await sessionManager.setState(id, 'pending');
      else if (record.state === 'disconnected' || record.state === 'error') await sessionManager.setState(id, 'reconnecting');
      let current = sessionManager.get(id);
      if (current.state === 'pending') {
        await sessionManager.setState(id, 'pairing');
        current = sessionManager.get(id);
      }
      return createSocket(current);
    })().finally(() => starts.delete(id));
    starts.set(id, task);
    return task;
  }

  async function start({ number, isPrimary = false } = {}) {
    const record = await sessionManager.create({ number, isPrimary });
    return startExisting(record.id);
  }

  async function requestPairingCode(number) {
    const runtime = await start({ number });
    if (runtime.numberRegistered || runtime.auth.state?.creds?.registered) {
      throw new Error('Ce numéro possède déjà une session WhatsApp enregistrée.');
    }
    if (typeof runtime.socket.waitForSocketOpen !== 'function') {
      throw new Error('Le transport WhatsApp ne permet pas de confirmer son ouverture.');
    }
    let timeout;
    try {
      await Promise.race([
        runtime.socket.waitForSocketOpen(),
        new Promise((_, reject) => {
          timeout = setTimeoutFn(() => reject(new Error('Délai dépassé pendant la connexion WhatsApp.')), openTimeoutMs);
          timeout?.unref?.();
        }),
      ]);
    } finally {
      if (timeout) clearTimeoutFn(timeout);
    }
    const code = await runtime.socket.requestPairingCode(String(number).replace(/\D/g, ''));
    return { session: sessionManager.get(runtime.id), code: String(code) };
  }

  async function stop(id, { force = false } = {}) {
    const runtime = runtimes.get(id);
    if (runtime?.reconnectTimer) clearTimeoutFn(runtime.reconnectTimer);
    if (runtime && sessionManager.get(id)?.state === 'connected' && !force) {
      throw new Error('Déconnecte cette session avant de la supprimer.');
    }
    if (runtime) {
      runtime.closed = true;
      runtimes.delete(id);
      try { runtime.socket.end?.(undefined); } catch {}
    }
    return sessionManager.remove(id, { force });
  }

  return Object.freeze({
    start,
    startExisting,
    requestPairingCode,
    stop,
    getSocket(id) { return runtimes.get(id)?.socket || null; },
    getRuntime(id) { return runtimes.get(id) || null; },
    list() { return sessionManager.list(); },
    get size() { return runtimes.size; },
  });
}
