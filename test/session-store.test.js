import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createSupabaseSessionStore } from '../core/session-store.js';

const encryptionKey = Buffer.alloc(32, 7).toString('base64');

test('session store stays local-only when Supabase credentials are absent', async () => {
  const store = createSupabaseSessionStore({ url: '', serviceKey: '', encryptionKey: '' });
  assert.equal(store.enabled, false);
  assert.equal(store.status, 'local-only');
  assert.deepEqual(await store.restore('/tmp/mhe-unused'), { enabled: false, restored: 0 });
  assert.deepEqual(await store.sync('/tmp/mhe-unused'), { enabled: false, uploaded: 0 });
});

test('session store encrypts, restores, uploads changed files, and clears only its prefix', async () => {
  const sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mhe-session-source-'));
  const restoredDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mhe-session-restored-'));
  const objects = new Map();

  const fetchImpl = async (url, options = {}) => {
    const route = new URL(url).pathname.replace('/storage/v1', '');
    if (route === '/object/list/mhe-sessions' && options.method === 'POST') {
      return new Response(JSON.stringify([...objects.keys()].map((key) => ({ name: key.slice('mhe/'.length) }))), { status: 200 });
    }
    if (route === '/object/authenticated/mhe-sessions/mhe/creds.json' && !options.method) {
      return new Response(objects.get('mhe/creds.json'), { status: 200 });
    }
    if (route === '/object/mhe-sessions/mhe/creds.json' && options.method === 'POST') {
      objects.set('mhe/creds.json', Buffer.from(options.body));
      return new Response('{}', { status: 200 });
    }
    if (route === '/object/mhe-sessions' && options.method === 'DELETE') {
      const body = JSON.parse(options.body);
      for (const key of body.prefixes) objects.delete(key);
      return new Response('{}', { status: 200 });
    }
    return new Response('unexpected request', { status: 404 });
  };

  try {
    const options = {
      url: 'https://example.supabase.co',
      serviceKey: 'test-service-role-key',
      encryptionKey,
      fetchImpl,
      logger: { info() {} },
    };
    const store = createSupabaseSessionStore(options);
    await fs.writeFile(path.join(sourceDir, 'creds.json'), '{"registered":true}');
    const synced = await store.sync(sourceDir);
    assert.equal(synced.uploaded, 1);
    assert.equal(objects.get('mhe/creds.json').subarray(0, 4).toString(), 'MHE1');
    assert.equal(objects.get('mhe/creds.json').toString().includes('registered'), false);

    const restoredStore = createSupabaseSessionStore(options);
    const restored = await restoredStore.restore(restoredDir);
    assert.equal(restored.restored, 1);
    assert.equal(await fs.readFile(path.join(restoredDir, 'creds.json'), 'utf8'), '{"registered":true}');

    await fs.writeFile(path.join(sourceDir, 'creds.json'), '{"registered":false,"changed":true}');
    const changed = await store.sync(sourceDir);
    assert.equal(changed.uploaded, 1);

    const cleared = await store.clear();
    assert.equal(cleared.deleted, 1);
    assert.equal(objects.size, 0);
  } finally {
    await fs.rm(sourceDir, { recursive: true, force: true });
    await fs.rm(restoredDir, { recursive: true, force: true });
  }
});

test('session store rejects non-HTTPS remote endpoints and invalid encryption keys', () => {
  assert.throws(
    () => createSupabaseSessionStore({ url: 'http://storage.example.com', serviceKey: 'secret', encryptionKey }),
    /must use HTTPS/,
  );
  assert.throws(
    () => createSupabaseSessionStore({ url: 'https://example.supabase.co', serviceKey: 'secret', encryptionKey: 'bad' }),
    /32-byte key/,
  );
});
