import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createDurableSessionRegistry } from '../core/session-registry-store.js';

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
    const registry = createDurableSessionRegistry({ store, directory });
    assert.deepEqual(await registry.load(), { enabled: true, sessions: [] });
    await registry.persist([{
      id: 'session-12345678',
      number: '243811111111',
      state: 'connected',
      isPrimary: true,
    }]);
    assert.equal(remote.has('registry.json'), true);

    const restored = createDurableSessionRegistry({ store, directory: path.join(root, 'restart') });
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
