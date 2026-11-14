import { randomUUID } from 'node:crypto';

const PHONE_PATTERN = /^\d{10,15}$/;
const SESSION_STATES = new Set([
  'pending',
  'pairing',
  'connected',
  'reconnecting',
  'disconnected',
  'logged_out',
  'error',
]);
const TRANSITIONS = {
  pending: new Set(['pairing', 'logged_out', 'error']),
  pairing: new Set(['connected', 'pending', 'reconnecting', 'disconnected', 'logged_out', 'error']),
  connected: new Set(['reconnecting', 'disconnected', 'logged_out', 'error']),
  reconnecting: new Set(['connected', 'disconnected', 'logged_out', 'error']),
  disconnected: new Set(['pairing', 'reconnecting', 'logged_out', 'error']),
  logged_out: new Set(['pending']),
  error: new Set(['pending', 'pairing', 'disconnected', 'logged_out']),
};

function normalizeNumber(value) {
  const number = String(value ?? '').replace(/\D/g, '');
  if (!PHONE_PATTERN.test(number)) {
    throw new TypeError('Le numéro doit être au format international et contenir entre 10 et 15 chiffres.');
  }
  return number;
}

function publicRecord(record) {
  if (!record) return null;
  const { number, ...safe } = record;
  return {
    ...safe,
    numberMasked: number ? `${'•'.repeat(Math.max(0, number.length - 4))}${number.slice(-4)}` : null,
  };
}

/**
 * In-memory coordinator for independent WhatsApp sessions.
 *
 * Persistence is injected deliberately: a process-local Map must never be
 * mistaken for durable storage on ephemeral hosts such as Render Free.
 */
export function createSessionManager({
  maxSessions = 50,
  idFactory = randomUUID,
  persist = async () => {},
  initialSessions = [],
  now = () => new Date().toISOString(),
} = {}) {
  if (!Number.isInteger(maxSessions) || maxSessions < 1 || maxSessions > 500) {
    throw new TypeError('maxSessions must be an integer between 1 and 500.');
  }
  if (typeof idFactory !== 'function' || typeof persist !== 'function' || typeof now !== 'function') {
    throw new TypeError('idFactory, persist and now must be functions.');
  }

  if (!Array.isArray(initialSessions) || initialSessions.length > maxSessions) {
    throw new TypeError('initialSessions must be an array within maxSessions.');
  }
  const sessions = new Map();
  const numberIndex = new Map();
  for (const item of initialSessions) {
    if (!item || typeof item !== 'object') throw new TypeError('Invalid restored session record.');
    const id = String(item.id || '');
    const number = normalizeNumber(item.number);
    if (!/^[a-zA-Z0-9-]{8,80}$/.test(id) || sessions.has(id) || numberIndex.has(number)) {
      throw new TypeError('Restored session identifiers and numbers must be unique and valid.');
    }
    if (!SESSION_STATES.has(item.state)) throw new TypeError('Restored session state is invalid.');
    if (item.isPrimary && [...sessions.values()].some((entry) => entry.isPrimary)) {
      throw new TypeError('Only one restored primary session is allowed.');
    }
    const record = {
      id,
      number,
      isPrimary: Boolean(item.isPrimary),
      state: item.state,
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : now(),
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : now(),
      lastActivityAt: typeof item.lastActivityAt === 'string' ? item.lastActivityAt : null,
      errorCode: item.state === 'error' ? String(item.errorCode || 'unknown').slice(0, 80) : null,
    };
    sessions.set(id, record);
    numberIndex.set(number, id);
  }
  const locks = new Map();
  let mutationQueue = Promise.resolve();

  function serializeMutation(operation) {
    const result = mutationQueue.then(operation);
    mutationQueue = result.catch(() => {});
    return result;
  }

  async function save() {
    await persist([...sessions.values()].map((record) => ({ ...record })));
  }

  function create({ number, isPrimary = false } = {}) {
    return serializeMutation(async () => {
    const normalized = normalizeNumber(number);
    const existingId = numberIndex.get(normalized);
    if (existingId) return publicRecord(sessions.get(existingId));
    if (sessions.size >= maxSessions) throw new Error('La limite de connexions M.H.E est atteinte.');
    if (isPrimary && [...sessions.values()].some((item) => item.isPrimary)) {
      throw new Error('Un seul compte principal M.H.E peut être défini.');
    }

    const id = String(idFactory());
    if (!/^[a-zA-Z0-9-]{8,80}$/.test(id) || sessions.has(id)) {
      throw new Error('La génération de l’identifiant de session a échoué.');
    }
    const record = {
      id,
      number: normalized,
      isPrimary: Boolean(isPrimary),
      state: 'pending',
      createdAt: now(),
      updatedAt: now(),
      lastActivityAt: null,
      errorCode: null,
    };
    sessions.set(id, record);
    numberIndex.set(normalized, id);
    try {
      await save();
    } catch (error) {
      sessions.delete(id);
      numberIndex.delete(normalized);
      throw error;
    }
    return publicRecord(record);
    });
  }

  function setState(id, nextState, { errorCode = null, activity = false } = {}) {
    return serializeMutation(async () => {
    if (!SESSION_STATES.has(nextState)) throw new TypeError('Unknown WhatsApp session state.');
    const record = sessions.get(id);
    if (!record) throw new Error('Session M.H.E introuvable.');
    if (record.state !== nextState && !TRANSITIONS[record.state]?.has(nextState)) {
      throw new Error(`Transition de session invalide : ${record.state} → ${nextState}.`);
    }
    const previous = { ...record };
    record.state = nextState;
    record.updatedAt = now();
    record.errorCode = nextState === 'error' ? String(errorCode || 'unknown').slice(0, 80) : null;
    if (activity) record.lastActivityAt = record.updatedAt;
    try {
      await save();
    } catch (error) {
      Object.assign(record, previous);
      throw error;
    }
    return publicRecord(record);
    });
  }

  function remove(id, { force = false } = {}) {
    return serializeMutation(async () => {
    const record = sessions.get(id);
    if (!record) return false;
    if (record.state === 'connected' && !force) {
      throw new Error('Déconnecte cette session avant de la supprimer.');
    }
    const previous = { ...record };
    sessions.delete(id);
    numberIndex.delete(record.number);
    try {
      await save();
    } catch (error) {
      sessions.set(id, previous);
      numberIndex.set(previous.number, id);
      throw error;
    }
    return true;
    });
  }

  async function withLock(id, operation) {
    if (!sessions.has(id)) throw new Error('Session M.H.E introuvable.');
    if (typeof operation !== 'function') throw new TypeError('operation must be a function.');
    const previous = locks.get(id) || Promise.resolve();
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const queued = previous.then(() => gate);
    locks.set(id, queued);
    await previous;
    try {
      return await operation(publicRecord(sessions.get(id)));
    } finally {
      release();
      if (locks.get(id) === queued) locks.delete(id);
    }
  }

  return Object.freeze({
    create,
    setState,
    remove,
    withLock,
    get(id) { return publicRecord(sessions.get(id)); },
    getByNumber(number) {
      const normalized = normalizeNumber(number);
      return publicRecord(sessions.get(numberIndex.get(normalized)));
    },
    list() {
      return [...sessions.values()]
        .map(publicRecord)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    get size() { return sessions.size; },
  });
}
