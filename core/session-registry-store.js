import fs from 'node:fs/promises';
import path from 'node:path';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const REGISTRY_FILE = 'registry.json';
const REGISTRY_VERSION = 1;
const ENVELOPE_MAGIC = Buffer.from('MHER1');

function createRegistryCipher(encryptionKey) {
  const key = Buffer.from(String(encryptionKey || ''), 'base64');
  if (key.length !== 32) throw new Error('MHE_SESSION_ENCRYPTION_KEY must be a base64-encoded 32-byte key for the session registry.');
  return {
    encrypt(plaintext) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      return Buffer.concat([ENVELOPE_MAGIC, iv, cipher.getAuthTag(), ciphertext]);
    },
    decrypt(envelope) {
      if (envelope.length < 33 || !envelope.subarray(0, 5).equals(ENVELOPE_MAGIC)) {
        throw new Error('The local M.H.E session registry is not encrypted or has an unsupported format.');
      }
      const decipher = createDecipheriv('aes-256-gcm', key, envelope.subarray(5, 17));
      decipher.setAuthTag(envelope.subarray(17, 33));
      return Buffer.concat([decipher.update(envelope.subarray(33)), decipher.final()]);
    },
  };
}

/**
 * Persists private session metadata through an encrypted Supabase store and
 * encrypts the local registry file as well. Phone numbers never remain in
 * plaintext on the application filesystem.
 */
export function createDurableSessionRegistry({
  store,
  directory = './.mhe-session-registry',
  logger = console,
  maxSessions = 50,
  encryptionKey = process.env.MHE_SESSION_ENCRYPTION_KEY,
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
  let cipher;

  function requireCipher() {
    if (!cipher) cipher = createRegistryCipher(encryptionKey);
    return cipher;
  }

  async function load() {
    if (loaded) throw new Error('Session registry can only be loaded once.');
    loaded = true;
    if (!store.enabled) {
      logger.warn?.('Encrypted registry storage is disabled; multi-session persistence is unavailable.');
      return { enabled: false, sessions: [] };
    }

    requireCipher();
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    await store.restore(directory);
    let parsed;
    try {
      const encrypted = await fs.readFile(filePath);
      parsed = JSON.parse(requireCipher().decrypt(encrypted).toString('utf8'));
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

    let encrypted;
    try {
      encrypted = requireCipher().encrypt(Buffer.from(JSON.stringify({ version: REGISTRY_VERSION, sessions }), 'utf8'));
    } catch (error) {
      return Promise.reject(error);
    }
    const task = writeQueue.then(async () => {
      await fs.mkdir(directory, { recursive: true, mode: 0o700 });
      const temporaryPath = path.join(directory, `.registry-${process.pid}-${Date.now()}.tmp`);
      try {
        await fs.writeFile(temporaryPath, encrypted, { mode: 0o600, flag: 'wx' });
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
