import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecentGroupMessages } from '../core/recent-group-messages.js';

test('keeps only the newest message keys for each group', () => {
  const tracked = createRecentGroupMessages({ maxGroups: 2, maxMessagesPerGroup: 2 });
  const first = { id: '1' };
  const second = { id: '2' };
  const third = { id: '3' };
  tracked.add('group@g.us', first);
  tracked.add('group@g.us', second);
  tracked.add('group@g.us', third);
  assert.deepEqual(tracked.get('group@g.us'), [second, third]);
});

test('evicts least recently active groups to keep memory bounded', () => {
  const tracked = createRecentGroupMessages({ maxGroups: 2, maxMessagesPerGroup: 10 });
  tracked.add('old@g.us', { id: 'old' });
  tracked.add('active@g.us', { id: 'active' });
  tracked.add('old@g.us', { id: 'old-2' });
  tracked.add('new@g.us', { id: 'new' });
  assert.equal(tracked.size, 2);
  assert.deepEqual(tracked.get('old@g.us').map(({ id }) => id), ['old', 'old-2']);
  assert.deepEqual(tracked.get('active@g.us'), []);
  assert.deepEqual(tracked.get('new@g.us').map(({ id }) => id), ['new']);
});

test('rejects invalid retention limits', () => {
  assert.throws(() => createRecentGroupMessages({ maxGroups: 0 }), RangeError);
  assert.throws(() => createRecentGroupMessages({ maxMessagesPerGroup: 1.5 }), RangeError);
});
