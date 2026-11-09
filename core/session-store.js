import fs from 'node:fs/promises';
import path from 'node:path';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const JSON_FILE = /^[a-zA-Z0-9._-]+\.json$/;

function encodeObjectPath(value) {
  return value.split('/').map(encodeURIComponent).join('/');
}

export function createSupabaseSessionStore({
  url = process.env.SUPABASE_URL,
  serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY,
  encryptionKey = process.env.MHE_SESSION_ENCRYPTION_KEY,
  bucket = process.env.MHE_SESSION_BUCKET || 'mhe-sessions',
  prefix = process.env.MHE_SESSION_PREFIX || 'mhe/',
  fetchImpl = globalThis.fetch,
  logger = console,
} = {}) {
  const configured = Boolean(url && serviceKey && encryptionKey);
  const partiallyConfigured = Boolean(url || serviceKey || encryptionKey);
  const key = configured ? Buffer.from(encryptionKey, 'base64') : null;
  if (configured && key.length !== 32) throw new Error('MHE_SESSION_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
  let baseUrl = '';
  if (configured) {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(parsed.hostname)) {
      throw new Error('SUPABASE_URL must use HTTPS.');
    }
    baseUrl = parsed.toString().replace(/\/$/, '');
  }
  if (!/^[a-z0-9][a-z0-9_-]{1,62}$/.test(bucket)) {
    throw new Error('MHE_SESSION_BUCKET is invalid.');
  }
  const normalizedPrefix = prefix.replace(/^\/+|\/+$/g, '') + '/';
  const fingerprints = new Map();
  let syncPromise;

  function encrypt(data) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    return Buffer.concat([Buffer.from('MHE1'), iv, cipher.getAuthTag(), encrypted]);
  }

  function decrypt(data) {
    if (data.length < 32 || data.subarray(0, 4).toString() !== 'MHE1') {
      throw new Error('Remote WhatsApp session file has an invalid encrypted format.');
    }
    const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(4, 16));
    decipher.setAuthTag(data.subarray(16, 32));
    return Buffer.concat([decipher.update(data.subarray(32)), decipher.final()]);
  }

  function headers(extra = {}) {
    return {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      ...extra,
    };
  }

  async function request(route, options = {}) {
    const response = await fetchImpl(`${baseUrl}/storage/v1${route}`, {
      ...options,
      headers: headers(options.headers),
      signal: options.signal || AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 200);
      throw new Error(`Supabase Storage request failed (${response.status})${detail ? `: ${detail}` : ''}`);
    }
    return response;
  }

  async function listRemote() {
    const response = await request(`/object/list/${encodeURIComponent(bucket)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix: normalizedPrefix, limit: 1000, offset: 0, sortBy: { column: 'name', order: 'asc' } }),
    });
    const objects = await response.json();
    return Array.isArray(objects)
      ? objects.map((item) => item.name).filter((name) => typeof name === 'string' && JSON_FILE.test(name))
      : [];
  }

  async function restore(directory) {
    if (!configured) return { enabled: false, restored: 0 };
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const names = await listRemote();
    let restored = 0;
    for (const name of names) {
      const objectPath = encodeObjectPath(`${normalizedPrefix}${name}`);
      const response = await request(`/object/authenticated/${encodeURIComponent(bucket)}/${objectPath}`);
      const data = decrypt(Buffer.from(await response.arrayBuffer()));
      const target = path.join(directory, name);
      await fs.writeFile(target, data, { mode: 0o600 });
      const stat = await fs.stat(target);
      fingerprints.set(name, `${stat.size}:${stat.mtimeMs}`);
      restored += 1;
    }
    logger.info?.({ restored }, 'WhatsApp session restored from private object storage');
    return { enabled: true, restored };
  }

  async function sync(directory) {
    if (!configured) return { enabled: false, uploaded: 0 };
    if (syncPromise) return syncPromise;
    syncPromise = (async () => {
      await fs.mkdir(directory, { recursive: true, mode: 0o700 });
      const entries = await fs.readdir(directory, { withFileTypes: true });
      let uploaded = 0;
      for (const entry of entries) {
        if (!entry.isFile() || !JSON_FILE.test(entry.name)) continue;
        const filePath = path.join(directory, entry.name);
        const stat = await fs.stat(filePath);
        const fingerprint = `${stat.size}:${stat.mtimeMs}`;
        if (fingerprints.get(entry.name) === fingerprint) continue;
        const data = await fs.readFile(filePath);
        const objectPath = encodeObjectPath(`${normalizedPrefix}${entry.name}`);
        await request(`/object/${encodeURIComponent(bucket)}/${objectPath}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream', 'x-upsert': 'true' },
          body: encrypt(data),
        });
        fingerprints.set(entry.name, fingerprint);
        uploaded += 1;
      }
      if (uploaded) logger.info?.({ uploaded }, 'WhatsApp session changes saved to private object storage');
      return { enabled: true, uploaded };
    })().finally(() => { syncPromise = undefined; });
    return syncPromise;
  }

  async function clear() {
    if (!configured) return { enabled: false, deleted: 0 };
    if (syncPromise) await syncPromise;
    const names = await listRemote();
    if (!names.length) {
      fingerprints.clear();
      return { enabled: true, deleted: 0 };
    }
    const prefixes = names.map((name) => `${normalizedPrefix}${name}`);
    await request(`/object/${encodeURIComponent(bucket)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes }),
    });
    fingerprints.clear();
    return { enabled: true, deleted: names.length };
  }

  return {
    enabled: configured,
    status: configured ? 'remote-encrypted-storage' : partiallyConfigured ? 'local-only-missing-storage-or-encryption-secret' : 'local-only',
    restore,
    sync,
    clear,
  };
}
