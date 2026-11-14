import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createDurableSessionRegistry } from '../core/session-registry-store.js';

const encryptionKey = Buffer.alloc(32, 7).toString('base64');

test('loads and persists a versioned session registry through the encrypted store adapter', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mhe-registry-'));
  const remote = new Map();
  const directory = path.join(root, 'registry');
  const store = {
    enabled: true,
    async restore(target) {
      await fs.mkdir(target, { recursive: true });
      for (const [name, data] of remote) await fs.writeFile(path.join(target, name), data, { mode: 0o600 });
      return { enabled: true, restored: remote.size };
    },
    async sync(target) {
      for (const name of await fs.readdir(target)) {
        if (name.endsWith('.json')) remote.set(name, await fs.readFile(path.join(target, name)));
      }
      return { enabled: true };
    },
  };

  try {
    const registry = createDurableSessionRegistry({ store, directory, encryptionKey });
    assert.deepEqual(await registry.load(), { enabled: true, sessions: [] });
    await registry.persist([{
      id: 'session-12345678',
      number: '243811111111',
      state: 'connected',
      isPrimary: true,
    }]);
    assert.equal(remote.has('registry.json'), true);
    const localRegistry = await fs.readFile(path.join(directory, 'registry.json'));
    assert.equal(localRegistry.includes(Buffer.from('243811111111')), false);

    const restored = createDurableSessionRegistry({ store, directory: path.join(root, 'restart'), encryptionKey });
    const snapshot = await restored.load();
    assert.equal(snapshot.enabled, true);
    assert.equal(snapshot.sessions.length, 1);
    assert.equal(snapshot.sessions[0].number, '243811111111');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('refuses to claim durable persistence when encrypted storage is disabled', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mhe-registry-off-'));
  try {
    const registry = createDurableSessionRegistry({
      store: { enabled: false, async restore() {}, async sync() {} },
      directory: root,
    });
    assert.deepEqual(await registry.load(), { enabled: false, sessions: [] });
    await assert.rejects(registry.persist([]), /Encrypted registry storage is required/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('rejects a tampered local session registry instead of restoring corrupted metadata', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mhe-registry-tamper-'));
  const directory = path.join(root, 'registry');
  const store = {
    enabled: true,
    async restore() { await fs.mkdir(directory, { recursive: true }); },
    async sync() {},
  };
  try {
    const registry = createDurableSessionRegistry({ store, directory, encryptionKey });
    await registry.load();
    await registry.persist([{ id: 'session-12345678', number: '243811111111', state: 'pending' }]);
    const file = path.join(directory, 'registry.json');
    const encrypted = await fs.readFile(file);
    encrypted[encrypted.length - 1] ^= 0xff;
    await fs.writeFile(file, encrypted);
    const restored = createDurableSessionRegistry({ store, directory, encryptionKey });
    await assert.rejects(restored.load(), /registry is unreadable or invalid/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('requires a valid encryption key whenever durable registry storage is enabled', async () => {
  const registry = createDurableSessionRegistry({
    store: { enabled: true, async restore() {}, async sync() {} },
    directory: './unused-test-registry',
    encryptionKey: 'not-a-key',
  });
  await assert.rejects(registry.load(), /base64-encoded 32-byte key/);
});
