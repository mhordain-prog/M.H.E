import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createMultiSessionService } from '../core/multi-session-service.js';

function runtimeDependencies() {
  return {
    makeWASocket: () => ({ ev: { on() {} } }),
    useMultiFileAuthState: async () => ({
      state: { creds: { registered: false } },
      saveCreds: async () => {},
    }),
    fetchLatestBaileysVersion: async () => ({ version: [2, 3000, 0] }),
  };
}

test('initializes the multi-session service with durable registry persistence', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mhe-service-'));
  const synced = [];
  const service = createMultiSessionService({
    ...runtimeDependencies(),
    registryDirectory: path.join(root, 'registry'),
    sessionDirectory: path.join(root, 'sessions'),
    createStore: ({ prefix }) => ({
      enabled: true,
      async restore() { return { enabled: true, restored: 0 }; },
      async sync(directory) {
        synced.push({ prefix, files: await fs.readdir(directory) });
        return { enabled: true };
      },
    }),
  });

  try {
    const initialized = await service.initialize();
    assert.equal(initialized.enabled, true);
    assert.equal(initialized.sessions.length, 0);
    assert.equal(service.enabled, true);
    const record = await service.sessionManager.create({ number: '243811111111' });
    assert.equal(record.state, 'pending');
    assert.ok(synced.some((item) => item.prefix === 'mhe/registry/' && item.files.includes('registry.json')));
    assert.equal(service.runtime.list().length, 1);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('keeps multi-session mode disabled without encrypted registry storage', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mhe-service-disabled-'));
  try {
    const service = createMultiSessionService({
      ...runtimeDependencies(),
      registryDirectory: root,
      createStore: () => ({
        enabled: false,
        async restore() { return { enabled: false, restored: 0 }; },
        async sync() { return { enabled: false, uploaded: 0 }; },
      }),
    });
    const result = await service.initialize();
    assert.equal(result.enabled, false);
    assert.equal(service.enabled, false);
    assert.equal(service.sessionManager, null);
    assert.equal(service.runtime, null);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
