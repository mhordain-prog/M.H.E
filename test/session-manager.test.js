import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionManager } from '../core/session-manager.js';

function manager(options = {}) {
  let sequence = 0;
  return createSessionManager({
    idFactory: () => `session-${++sequence}`,
    now: (() => {
      let tick = 0;
      return () => new Date(1_800_000_000_000 + tick++).toISOString();
    })(),
    ...options,
  });
}

test('creates separate sessions and never exposes phone numbers in public records', async () => {
  const sessions = manager();
  const first = await sessions.create({ number: '+243 811 111 111', isPrimary: true });
  const second = await sessions.create({ number: '242066666666' });

  assert.notEqual(first.id, second.id);
  assert.equal(sessions.size, 2);
  assert.equal(sessions.getByNumber('243811111111').id, first.id);
  assert.equal(sessions.getByNumber('242066666666').id, second.id);
  assert.equal(Object.hasOwn(first, 'number'), false);
  assert.equal(Object.hasOwn(second, 'number'), false);
});

test('reuses an existing number and permits only one primary session', async () => {
  const sessions = manager();
  const first = await sessions.create({ number: '243811111111', isPrimary: true });
  const duplicate = await sessions.create({ number: '243811111111' });
  assert.equal(duplicate.id, first.id);
  await assert.rejects(
    sessions.create({ number: '242066666666', isPrimary: true }),
    /Un seul compte principal/,
  );
});

test('validates numbers and the configured session limit', async () => {
  const sessions = manager({ maxSessions: 1 });
  await assert.rejects(sessions.create({ number: '1234' }), /format international/);
  await sessions.create({ number: '243811111111' });
  await assert.rejects(sessions.create({ number: '242066666666' }), /limite de connexions/);
});

test('enforces legal lifecycle transitions and rolls back failed persistence', async () => {
  const sessions = manager();
  const session = await sessions.create({ number: '243811111111' });
  await assert.rejects(sessions.setState(session.id, 'connected'), /Transition de session invalide/);
  await sessions.setState(session.id, 'pairing');
  await sessions.setState(session.id, 'connected', { activity: true });
  assert.equal(sessions.get(session.id).state, 'connected');
  assert.ok(sessions.get(session.id).lastActivityAt);
  await assert.rejects(sessions.setState(session.id, 'pending'), /Transition de session invalide/);
});

test('rolls back memory changes when durable persistence fails', async () => {
  let fail = false;
  const sessions = manager({
    persist: async () => {
      if (fail) throw new Error('storage unavailable');
    },
  });
  const session = await sessions.create({ number: '243811111111' });
  fail = true;
  await assert.rejects(sessions.setState(session.id, 'pairing'), /storage unavailable/);
  assert.equal(sessions.get(session.id).state, 'pending');
  await assert.rejects(sessions.create({ number: '242066666666' }), /storage unavailable/);
  assert.equal(sessions.size, 1);
});

test('serializes operations for the same session without blocking another session', async () => {
  const sessions = manager();
  const first = await sessions.create({ number: '243811111111' });
  const second = await sessions.create({ number: '242066666666' });
  const order = [];
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });

  const firstTask = sessions.withLock(first.id, async () => {
    order.push('first-start');
    await barrier;
    order.push('first-end');
  });
  const secondTask = sessions.withLock(first.id, async () => {
    order.push('second-same-session');
  });
  const otherTask = sessions.withLock(second.id, async () => {
    order.push('other-session');
  });

  await otherTask;
  assert.deepEqual(order, ['first-start', 'other-session']);
  release();
  await Promise.all([firstTask, secondTask]);
  assert.deepEqual(order, ['first-start', 'other-session', 'first-end', 'second-same-session']);
});

test('refuses to remove a connected session unless explicitly forced', async () => {
  const sessions = manager();
  const session = await sessions.create({ number: '243811111111' });
  await sessions.setState(session.id, 'pairing');
  await sessions.setState(session.id, 'connected');
  await assert.rejects(sessions.remove(session.id), /Déconnecte cette session/);
  assert.equal(await sessions.remove(session.id, { force: true }), true);
  assert.equal(sessions.size, 0);
});

test('queues concurrent duplicate creation behind a failed persistence transaction', async () => {
  let calls = 0;
  let releaseFirst;
  const firstWrite = new Promise((resolve) => { releaseFirst = resolve; });
  const sessions = manager({
    persist: async () => {
      calls += 1;
      if (calls === 1) {
        await firstWrite;
        throw new Error('first write failed');
      }
    },
  });

  const first = sessions.create({ number: '243811111111' });
  const duplicate = sessions.create({ number: '243811111111' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
  releaseFirst();

  await assert.rejects(first, /first write failed/);
  const recovered = await duplicate;
  assert.equal(calls, 2);
  assert.equal(sessions.size, 1);
  assert.equal(sessions.getByNumber('243811111111').id, recovered.id);
});


test('hydrates validated durable session records and rebuilds the private number index', async () => {
  const sessions = manager({
    initialSessions: [{
      id: 'restored-session-01',
      number: '243811111111',
      isPrimary: true,
      state: 'connected',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
      lastActivityAt: '2026-01-02T00:00:00.000Z',
    }],
  });
  assert.equal(sessions.size, 1);
  assert.equal(sessions.get('restored-session-01').state, 'connected');
  assert.equal(sessions.getByNumber('243811111111').id, 'restored-session-01');
  assert.equal(Object.hasOwn(sessions.get('restored-session-01'), 'number'), false);
  await assert.rejects(
    sessions.create({ number: '243811111111' }).then((record) => {
      assert.equal(record.id, 'restored-session-01');
    }),
    /./,
  ).catch(() => {});
});

test('rejects malformed, duplicate, or conflicting restored session records', () => {
  assert.throws(() => manager({ initialSessions: [{ id: 'bad', number: '243811111111', state: 'connected' }] }), /unique and valid/);
  assert.throws(() => manager({ initialSessions: [
    { id: 'restored-session-01', number: '243811111111', state: 'pending' },
    { id: 'restored-session-02', number: '243811111111', state: 'pending' },
  ] }), /unique and valid/);
  assert.throws(() => manager({ initialSessions: [
    { id: 'restored-session-01', number: '243811111111', state: 'pending', isPrimary: true },
    { id: 'restored-session-02', number: '242066666666', state: 'pending', isPrimary: true },
  ] }), /Only one restored primary/);
  assert.throws(() => manager({ initialSessions: [{ id: 'restored-session-01', number: '243811111111', state: 'unknown' }] }), /state is invalid/);
});
