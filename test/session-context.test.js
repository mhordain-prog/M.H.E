import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  bindSessionEvent,
  createContextualProxy,
  getSessionContext,
  runWithSessionContext,
} from '../core/session-context.js';

test('contextual proxies resolve independent sockets across concurrent async work', async () => {
  const primary = { name: 'primary', async getName() { await Promise.resolve(); return this.name; } };
  const proxy = createContextualProxy({ getFallback: () => primary, contextKey: 'socket' });
  const first = { name: 'first' };
  const second = { name: 'second' };

  const [a, b, fallback] = await Promise.all([
    runWithSessionContext({ socket: first }, async () => {
      await new Promise((resolve) => setImmediate(resolve));
      return proxy.getName();
    }),
    runWithSessionContext({ socket: second }, async () => {
      await Promise.resolve();
      return proxy.getName();
    }),
    proxy.getName(),
  ]);
  assert.deepEqual([a, b, fallback], ['first', 'second', 'primary']);
});

test('contextual proxy reads and writes the active session object', () => {
  const primary = { value: 1 };
  const proxy = createContextualProxy({ getFallback: () => primary, contextKey: 'settings', bindMethods: false });
  const other = { value: 2 };
  runWithSessionContext({ settings: other }, () => {
    assert.equal(proxy.value, 2);
    proxy.value = 3;
  });
  assert.equal(other.value, 3);
  assert.equal(primary.value, 1);
});

test('bound socket events run inside the matching session context', async () => {
  const emitter = new EventEmitter();
  const socket = { ev: emitter, name: 'session-7' };
  let observed;
  bindSessionEvent(socket, 'message', async (payload) => {
    await Promise.resolve();
    observed = { payload, socket: getSessionContext().socket.name };
  }, { id: 'session-7' });

  emitter.emit('message', 'hello');
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(observed, { payload: 'hello', socket: 'session-7' });
});

test('rejects invalid context and event registrations', () => {
  assert.throws(() => runWithSessionContext(null, () => {}), /context object/);
  assert.throws(() => runWithSessionContext({}, null), /callback/);
  assert.throws(() => bindSessionEvent({}, 'message', () => {}), /event emitter/);
});
