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
  for (const name of ['menu', 'menucat', 'searchcmd', 'auto', 'stats', 'mhestat', 'time', 'date', 'weather', 'wiki', 'todo', 'note', 'groupinfo', 'members', 'setrules', 'rules', 'admins', 'antilink', 'antispam', 'antitag', 'antistatusmention', 'kick', 'lockgc', 'unlockgc', 'ai', 'ask', 'explain', 'summarize', 'code', 'translate']) {
    assert.ok(commands.has(name), name);
  }
});

test('menu sends a live category selector with a safe text fallback', async () => {
  const { commands, sent } = setup();
  await commands.get('menu').handler({ chat: 'test@s.whatsapp.net' });
  const interactive = sent.find((item) => item.payload?.sections);
  assert.ok(interactive);
  assert.equal(interactive.payload.buttonText, 'OUVRIR LE MENU');
  assert.ok(interactive.payload.sections[0].rows.some((row) => row.rowId === 'mhecat:1'));
  assert.ok(interactive.payload.sections[0].rows.length <= 10);
  assert.ok(sent.some((item) => /M.H.E-MD GOLD/.test(item.text || '')));
  const listing = sent.find((item) => /MENU DES COMMANDES/.test(item.text || ''))?.text || '';
  assert.match(listing, /BOT/);
  assert.match(listing, /GROUP MANAGER/);
  assert.match(listing, /AI/);
  assert.doesNotMatch(listing, /GENERAL|PRODUCTIVITY|SYSTEM/);
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

test('category navigation uses human numbering and paginates long categories', async () => {
  const { commands, sent } = setup();
  await commands.get('menucat').handler({ chat: 'test@s.whatsapp.net', args: ['1'] });
  assert.match(sent.at(-1).text, /BOT/);
  assert.match(sent.at(-1).text, /Page 1\/1/);
  await commands.get('menucat').handler({ chat: 'test@s.whatsapp.net', args: ['0'] });
  assert.match(sent.at(-1).text, /Choisis un numéro de catégorie/);
});

test('anti-link setting is stored per group and requires a group admin', async () => {
  const { commands, settings, getSaved } = setup();
  await commands.get('antilink').handler({ chat: 'g@g.us', actor: 'admin@s.whatsapp.net', args: ['on'] });
  assert.equal(settings.groups['g@g.us'].antilink, true);
  assert.equal(getSaved(), 1);
});
