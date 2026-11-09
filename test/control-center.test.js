import test from 'node:test';
import assert from 'node:assert/strict';
import { createControlSnapshot } from '../core/control-center.js';

test('control snapshot reports live command counts and category totals', () => {
  const commands = new Map([
    ['menu', { name: 'menu', category: 'GENERAL', description: 'Open menu' }],
    ['ping', { name: 'ping', category: 'GENERAL', description: 'Check status' }],
    ['mode', { name: 'mode', category: 'OWNER', description: 'Set mode', ownerOnly: true }],
  ]);
  const snapshot = createControlSnapshot({
    commands, socket: { user: { id: 'private-id-not-returned' } }, mode: 'private',
    prefix: '.', ownerName: 'HORDAIN MADILA', startedAt: Date.now() - 5000,
  });
  assert.equal(snapshot.status, 'connected');
  assert.equal(snapshot.commandCount, 3);
  assert.deepEqual(snapshot.categories, [{ name: 'GENERAL', count: 2 }, { name: 'OWNER', count: 1 }]);
  assert.equal(snapshot.commands.find((item) => item.name === 'mode').ownerOnly, true);
  assert.equal(JSON.stringify(snapshot).includes('private-id-not-returned'), false);
  assert.ok(snapshot.uptimeSeconds >= 0);
});

test('control snapshot handles an offline socket and empty registry', () => {
  const snapshot = createControlSnapshot({
    commands: new Map(), socket: null, mode: 'private', prefix: '.',
    ownerName: 'HORDAIN MADILA', startedAt: Date.now(),
  });
  assert.equal(snapshot.status, 'waiting');
  assert.equal(snapshot.commandCount, 0);
  assert.deepEqual(snapshot.categories, []);
  assert.deepEqual(snapshot.commands, []);
});
