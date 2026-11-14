import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createSessionManager } from '../core/session-manager.js';
import { createWhatsAppSessionRuntime } from '../core/whatsapp-session-runtime.js';

async function setup(t) {
  const rootDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'mhe-wa-runtime-'));
  t.after(() => fs.rm(rootDirectory, { recursive: true, force: true }));
  let id = 0;
  const sessionManager = createSessionManager({ idFactory: () => `runtime-${++id}` });
  const sockets = [];
  const runtime = createWhatsAppSessionRuntime({
    sessionManager,
    rootDirectory,
    makeWASocket: (options) => {
      const ev = new EventEmitter();
      const socket = {
        options,
        ev,
        user: { id: `24380000000${sockets.length}:1@s.whatsapp.net` },
        waitForSocketOpen: async () => {},
        requestPairingCode: async (number) => `CODE-${number}`,
        end() {},
      };
      sockets.push(socket);
      return socket;
    },
    useMultiFileAuthState: async () => ({
      state: { creds: { registered: false } },
      saveCreds: async () => {},
    }),
    fetchLatestBaileysVersion: async () => ({ version: [2, 3000, 1] }),
    createStore: ({ prefix }) => ({
      prefix,
      restore: async () => ({ enabled: true, restored: 0 }),
      sync: async () => ({ enabled: true, uploaded: 0 }),
      clear: async () => ({ enabled: true, deleted: 0 }),
    }),
    onSocket: async () => {},
    logger: { info() {}, warn() {}, error() {} },
  });
  return { runtime, sessionManager, sockets, rootDirectory };
}

test('starts two independent WhatsApp sockets with separate auth paths and storage prefixes', async (t) => {
  const { runtime, sessionManager, sockets, rootDirectory } = await setup(t);
  const first = await runtime.start({ number: '243811111111', isPrimary: true });
  const second = await runtime.start({ number: '242066666666' });

  assert.equal(sockets.length, 2);
  assert.notEqual(first.id, second.id);
  assert.notEqual(first.directory, second.directory);
  assert.notEqual(first.store.prefix, second.store.prefix);
  assert.equal(first.store.prefix, `mhe/sessions/${first.id}/`);
  assert.equal(second.store.prefix, `mhe/sessions/${second.id}/`);
  assert.equal(sessionManager.get(first.id).state, 'pairing');
  assert.equal(sessionManager.get(second.id).state, 'pairing');
  assert.equal(await fs.stat(first.directory).then((s) => s.isDirectory()), true);
  assert.equal(await fs.stat(second.directory).then((s) => s.isDirectory()), true);
});

test('issues pairing codes for the requested number and keeps sessions separate', async (t) => {
  const { runtime, sessionManager } = await setup(t);
  const first = await runtime.requestPairingCode('243811111111');
  const second = await runtime.requestPairingCode('242066666666');
  assert.equal(first.code, 'CODE-243811111111');
  assert.equal(second.code, 'CODE-242066666666');
  assert.notEqual(first.session.id, second.session.id);
  assert.equal(sessionManager.size, 2);
});

test('marks the matching runtime connected when its socket opens', async (t) => {
  const { runtime, sessionManager, sockets } = await setup(t);
  const record = await runtime.start({ number: '243811111111' });
  sockets[0].ev.emit('connection.update', { connection: 'open' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(sessionManager.get(record.id).state, 'connected');
  assert.ok(sessionManager.get(record.id).lastActivityAt);
  assert.equal(runtime.getSocket(record.id), sockets[0]);
});
