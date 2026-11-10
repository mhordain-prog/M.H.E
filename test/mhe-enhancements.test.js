import test from 'node:test';
import assert from 'node:assert/strict';
import { registerMheEnhancements } from '../core/mhe-enhancements.js';

function setup() {
  const commands = new Map();
  const sent = [];
  const settings = {};
  let saved = 0;
  const register = (name, category, description, handler, ownerOnly = false) => commands.set(name, { name, category, description, handler, ownerOnly });
  registerMheEnhancements({
    register, commands, sendText: async (chat, text, options) => sent.push({ chat, text, options }),
    getSocket: () => ({ user: { id: 'bot@s.whatsapp.net' }, profilePictureUrl: async () => { throw new Error('no picture'); }, sendMessage: async (chat, payload) => { sent.push({ chat, payload }); } }),
    settings, saveSettings: async () => { saved += 1; }, getPrefix: () => '.', getMode: () => 'private',
    getBotName: () => 'M.H.E-MD GOLD', getOwnerName: () => 'HORDAIN MADILA', getVersion: () => '1.0 GOLD',
    getStartedAt: () => Date.now() - 5000, getGroupContext: async () => ({ actorIsAdmin: true, botIsAdmin: true, participants: [{ id: '123@s.whatsapp.net', admin: true }] }),
    requireGroup: (chat) => { if (!chat.endsWith('@g.us')) throw new Error('group only'); },
  });
  return { commands, sent, settings, getSaved: () => saved };
}

test('registers the enhanced menu and useful English command families', () => {
  const { commands } = setup();
  for (const name of ['menu', 'menucat', 'searchcmd', 'help', 'auto', 'upper', 'lower', 'base64', 'urlencode', 'urldecode', 'stats', 'mhestat', 'time', 'date', 'weather', 'wiki', 'todo', 'note', 'groupinfo', 'members', 'setrules', 'rules', 'admins', 'antilink', 'antispam', 'antitag', 'antistatusmention', 'kick', 'lockgc', 'unlockgc', 'ai', 'ask', 'explain', 'summarize', 'code', 'translate']) {
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
  assert.match(listing, /OWNER/);
  assert.match(listing, /BOT/);
  assert.match(listing, /GROUP MANAGER/);
  assert.match(listing, /AI/);
  assert.match(listing, /DOWNLOADER/);
  assert.match(listing, /CONVERTER/);
  assert.match(listing, /TOOLS/);
  assert.match(listing, /GAMES & FUN/);
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
  await commands.get('menucat').handler({ chat: 'test@s.whatsapp.net', args: ['2'] });
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

test('converter commands return real transformations', async () => {
  const { commands, sent } = setup();
  await commands.get('upper').handler({ chat: 'test@s.whatsapp.net', args: ['bonjour'] });
  assert.equal(sent.at(-1).text, 'BONJOUR');
  await commands.get('base64').handler({ chat: 'test@s.whatsapp.net', args: ['encode', 'Bonjour'] });
  assert.equal(sent.at(-1).text, 'Qm9uam91cg==');
  await commands.get('base64').handler({ chat: 'test@s.whatsapp.net', args: ['decode', 'Qm9uam91cg=='] });
  assert.equal(sent.at(-1).text, 'Bonjour');
});

test('empty downloader category is explicit rather than advertising fake commands', async () => {
  const { commands, sent } = setup();
  await commands.get('menucat').handler({ chat: 'test@s.whatsapp.net', args: ['5'] });
  assert.match(sent.at(-1).text, /fournisseur de téléchargement n’est pas encore configuré/);
});

test('owner-only commands are clearly marked in category details', async () => {
  const { commands, sent } = setup();
  commands.set('secret', { name: 'secret', category: 'OWNER', description: 'owner operation', ownerOnly: true });
  await commands.get('menucat').handler({ chat: 'test@s.whatsapp.net', args: ['1'] });
  assert.match(sent.at(-1).text, /secret 🔒 PROPRIÉTAIRE/);
});

test('help accepts a command written with the configured prefix', async () => {
  const { commands, sent } = setup();
  commands.set('ping', { name: 'ping', category: 'GENERAL', description: 'Check the bot', handler: async () => {} });
  await commands.get('help').handler({ chat: 'test@s.whatsapp.net', args: ['.ping'] });
  assert.match(sent.at(-1).text, /AIDE — \.ping/);
  assert.match(sent.at(-1).text, /Check the bot/);
});

test('kick refuses to remove a group administrator', async () => {
  const { commands } = setup();
  await assert.rejects(
    commands.get('kick').handler({
      chat: 'g@g.us',
      actor: 'admin@s.whatsapp.net',
      message: { message: { extendedTextMessage: { contextInfo: { mentionedJid: ['123:4@s.whatsapp.net'] } } } },
    }),
    /ne peut pas retirer un administrateur/,
  );
});
