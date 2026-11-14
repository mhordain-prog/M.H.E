import fs from 'node:fs/promises';
import path from 'node:path';

const REGISTRY_FILE = 'registry.json';
const REGISTRY_VERSION = 1;

/**
 * Persists private session metadata through the encrypted Supabase session
 * store. The registry contains phone numbers and must never be exposed by HTTP.
 */
export function createDurableSessionRegistry({
  store,
  directory = './.mhe-session-registry',
  logger = console,
  maxSessions = 50,
} = {}) {
  if (!store || typeof store.restore !== 'function' || typeof store.sync !== 'function') {
    throw new TypeError('An encrypted session store is required.');
  }
  if (!Number.isInteger(maxSessions) || maxSessions < 1 || maxSessions > 500) {
    throw new TypeError('maxSessions must be an integer between 1 and 500.');
  }

  const filePath = path.join(directory, REGISTRY_FILE);
  let loaded = false;
  let writeQueue = Promise.resolve();

  async function load() {
    if (loaded) throw new Error('Session registry can only be loaded once.');
    loaded = true;
    if (!store.enabled) {
      logger.warn?.('Encrypted registry storage is disabled; multi-session persistence is unavailable.');
      return { enabled: false, sessions: [] };
    }

    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    await store.restore(directory);
    let parsed;
    try {
      parsed = JSON.parse(await fs.readFile(filePath, 'utf8'));
    } catch (error) {
      if (error?.code === 'ENOENT') return { enabled: true, sessions: [] };
      throw new Error('The encrypted M.H.E session registry is unreadable or invalid.', { cause: error });
    }

    if (!parsed || parsed.version !== REGISTRY_VERSION || !Array.isArray(parsed.sessions) ||
        parsed.sessions.length > maxSessions) {
      throw new Error('The encrypted M.H.E session registry has an unsupported format.');
    }
    return { enabled: true, sessions: parsed.sessions };
  }

  function persist(sessions) {
    if (!loaded) return Promise.reject(new Error('Load the session registry before writing it.'));
    if (!store.enabled) return Promise.reject(new Error('Encrypted registry storage is required for durable multi-session mode.'));
    if (!Array.isArray(sessions) || sessions.length > maxSessions) {
      return Promise.reject(new TypeError('Invalid session registry snapshot.'));
    }

    const snapshot = JSON.stringify({ version: REGISTRY_VERSION, sessions });
    const task = writeQueue.then(async () => {
      await fs.mkdir(directory, { recursive: true, mode: 0o700 });
      const temporaryPath = path.join(directory, `.registry-${process.pid}-${Date.now()}.tmp`);
      try {
        await fs.writeFile(temporaryPath, snapshot, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
        await fs.rename(temporaryPath, filePath);
        await store.sync(directory);
      } catch (error) {
        await fs.rm(temporaryPath, { force: true }).catch(() => {});
        throw error;
      }
    });
    writeQueue = task.catch(() => {});
    return task;
  }

  return Object.freeze({ load, persist, get enabled() { return Boolean(store.enabled); } });
}
