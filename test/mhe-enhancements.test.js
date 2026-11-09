import test from 'node:test';
import assert from 'node:assert/strict';
import { registerMheEnhancements } from '../core/mhe-enhancements.js';

function setup() {
  const commands = new Map();
  const sent = [];
  const settings = {};
  let saved = 0;
  const register = (name, category, description, handler) => commands.set(name, { name, category, description, handler });
  registerMheEnhancements({
    register, commands, sendText: async (chat, text, options) => sent.push({ chat, text, options }),
    getSocket: () => ({ user: { id: 'bot@s.whatsapp.net' }, profilePictureUrl: async () => { throw new Error('no picture'); }, sendMessage: async (chat, payload) => { sent.push({ chat, payload }); } }),
    settings, saveSettings: async () => { saved += 1; }, getPrefix: () => '.', getMode: () => 'private',
    getBotName: () => 'M.H.E-MD GOLD', getOwnerName: () => 'HORDAIN MADILA', getVersion: () => '1.0 GOLD',
    getStartedAt: () => Date.now() - 5000, getGroupContext: async () => ({ actorIsAdmin: true }),
    requireGroup: (chat) => { if (!chat.endsWith('@g.us')) throw new Error('group only'); },
  });
  return { commands, sent, settings, getSaved: () => saved };
}

test('registers the enhanced menu and useful English command families', () => {
  const { commands } = setup();
  for (const name of ['menu', 'menucat', 'searchcmd', 'stats', 'time', 'date', 'weather', 'wiki', 'todo', 'note', 'groupinfo', 'members', 'setrules', 'rules']) {
    assert.ok(commands.has(name), name);
  }
});

test('todo list is stored per sender and persisted', async () => {
  const { commands, settings, sent, getSaved } = setup();
  await commands.get('todo').handler({ chat: 'a@s.whatsapp.net', actor: 'a@s.whatsapp.net', args: ['add', 'Finish homework'] });
  await commands.get('todo').handler({ chat: 'a@s.whatsapp.net', actor: 'a@s.whatsapp.net', args: ['done', '1'] });
  await commands.get('todo').handler({ chat: 'a@s.whatsapp.net', actor: 'a@s.whatsapp.net', args: ['list'] });
  assert.equal(settings.todos['a@s.whatsapp.net'][0].done, true);
  assert.match(sent.at(-1).text, /\[x\] Finish homework/);
  assert.equal(getSaved(), 2);
});

test('notes are private to each sender and can be deleted', async () => {
  const { commands, settings, sent } = setup();
  await commands.get('note').handler({ chat: 'a@s.whatsapp.net', actor: 'a@s.whatsapp.net', args: ['save', 'Remember this'] });
  await commands.get('note').handler({ chat: 'b@s.whatsapp.net', actor: 'b@s.whatsapp.net', args: ['list'] });
  assert.equal(settings.notes['a@s.whatsapp.net'].length, 1);
  assert.deepEqual(settings.notes['b@s.whatsapp.net'], []);
  assert.match(sent.at(-1).text, /no saved notes/i);
  await commands.get('note').handler({ chat: 'a@s.whatsapp.net', actor: 'a@s.whatsapp.net', args: ['delete', '1'] });
  assert.equal(settings.notes['a@s.whatsapp.net'].length, 0);
});

test('group rules require an administrator', async () => {
  const { commands, settings } = setup();
  await commands.get('setrules').handler({ chat: 'g@g.us', actor: 'admin@s.whatsapp.net', args: ['Be', 'respectful'] });
  assert.equal(settings.groups['g@g.us'].rules, 'Be respectful');
});
