import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createWarningManager } from '../core/warnings.js';

async function setup(t, options = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mhe-warnings-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'warnings.json');
  const sent = [];
  const manager = createWarningManager({
    file,
    sendText: async (...args) => sent.push(args),
    getSocket: () => ({ groupMetadata: async () => ({ participants: [] }) }),
    ...options,
  });
  return { file, manager, sent };
}

const groupJid = 'group@g.us';
const memberJid = '12345@s.whatsapp.net';

test('concurrent first warnings load once and persist all entries', async (t) => {
  const { file, manager } = await setup(t);
  await Promise.all([
    manager.warn({ groupJid, actorJid: memberJid, reason: 'lien' }),
    manager.warn({ groupJid, actorJid: memberJid, reason: 'spam' }),
  ]);
  const records = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(records[`${groupJid}|12345`].length, 2);
  assert.deepEqual((await manager.getWarnings(groupJid, memberJid)).map((entry) => entry.reason).sort(), ['lien', 'spam']);
});

test('warnings expire after 30 days and retain no more than three active entries', async (t) => {
  const { file, manager } = await setup(t);
  const old = Date.now() - 31 * 24 * 60 * 60 * 1000;
  await fs.writeFile(file, JSON.stringify({ [`${groupJid}|12345`]: [{ at: old, reason: 'ancien' }] }));
  const results = [];
  for (const reason of ['un', 'deux', 'trois', 'quatre']) {
    results.push(await manager.warn({ groupJid, actorJid: memberJid, reason }));
  }
  assert.equal(results.at(-1).count, 3);
  const warnings = await manager.getWarnings(groupJid, memberJid);
  assert.equal(warnings.length, 3);
  assert.deepEqual(warnings.map((entry) => entry.reason), ['deux', 'trois', 'quatre']);
});


test('legacy numeric warning keys remain readable across device-qualified JIDs', async (t) => {
  const { file, manager } = await setup(t);
  await fs.writeFile(file, JSON.stringify({ [`${groupJid}|12345`]: [{ at: Date.now(), reason: 'ancien format' }] }));
  assert.equal((await manager.getWarnings(groupJid, '12345:7@s.whatsapp.net'))[0].reason, 'ancien format');
  await manager.warn({ groupJid, actorJid: '12345:7@s.whatsapp.net', reason: 'nouveau' });
  const records = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(records[`${groupJid}|12345`].length, 2);
});

test('owners and group admins are not warned', async (t) => {
  const adminJid = '67890@s.whatsapp.net';
  const { manager, sent } = await setup(t, {
    isOwnerNumber: (number) => number === '11111',
    getSocket: () => ({ groupMetadata: async () => ({ participants: [{ id: adminJid, admin: true }] }) }),
  });
  assert.equal((await manager.warn({ groupJid, actorJid: '11111@s.whatsapp.net', reason: 'spam' })).skipped, true);
  assert.equal((await manager.warn({ groupJid, actorJid: adminJid, reason: 'spam' })).skipped, true);
  assert.equal(sent.length, 0);
});

test('spam detection flags exactly the threshold once per eight-second window', async (t) => {
  const { manager } = await setup(t);
  const results = Array.from({ length: 7 }, () => manager.detectSpam(groupJid, memberJid));
  assert.deepEqual(results, [false, false, false, false, false, true, false]);
  assert.ok(Array.from({ length: 20 }, () => manager.detectSpam(groupJid, memberJid)).every((flag) => !flag));
  assert.equal(manager.detectSpam(groupJid, 'other@s.whatsapp.net'), false);
});

test('persistence errors are surfaced instead of claiming a saved warning', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mhe-warning-error-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const blockedDirectory = path.join(directory, 'not-a-directory');
  await fs.writeFile(blockedDirectory, 'file');
  const manager = createWarningManager({
    file: path.join(blockedDirectory, 'warnings.json'),
    sendText: async () => assert.fail('warning should not be announced before persistence'),
    getSocket: () => ({ groupMetadata: async () => ({ participants: [] }) }),
  });
  await assert.rejects(manager.warn({ groupJid, actorJid: memberJid, reason: 'spam' }));
});
