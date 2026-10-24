import test from 'node:test';
import assert from 'node:assert/strict';
import { registerMheGoldV2 } from '../core/mhe-gold-v2.js';

function setup() {
  const commands = new Map();
  const sent = [];
  const settings = {};
  const register = (name, category, description, handler, ownerOnly = false) => {
    commands.set(name, { name, category, description, handler, ownerOnly });
  };
  const handleIncoming = registerMheGoldV2({
    register,
    sendText: async (chat, text) => { sent.push({ chat, text }); },
    settings,
    saveSettings: async () => {},
    getSocket: () => ({ sendMessage: async (chat, payload) => ({ key: { remoteJid: chat, id: 'test-id', fromMe: true }, payload }) }),
    getPrefix: () => '.',
  });
  return { commands, sent, settings, handleIncoming };
}

test('registers all three M.H.E GOLD V2 commands', () => {
  const { commands } = setup();
  assert.ok(commands.has('mheai'));
  assert.ok(commands.has('mheghost'));
  assert.ok(commands.has('mheclone'));
  assert.equal(commands.get('mheai').ownerOnly, true);
});

test('AI status defaults to disabled without sending private messages automatically', async () => {
  const { commands, sent, handleIncoming, settings } = setup();
  await commands.get('mheai').handler({ chat: 'owner@s.whatsapp.net', args: ['status'] });
  assert.match(sent.at(-1).text, /désactivé/);
  assert.equal(settings.mheai.enabled, false);
  const handled = await handleIncoming({
    key: { remoteJid: 'person@s.whatsapp.net', fromMe: false },
    message: { conversation: 'Bonjour' },
  }, { mode: 'public' });
  assert.equal(handled, false);
});

test('AI cannot be enabled when no API key is configured', async () => {
  const oldMhe = process.env.MHE_AI_API_KEY;
  const oldOpenAi = process.env.OPENAI_API_KEY;
  delete process.env.MHE_AI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const { commands, settings } = setup();
    await assert.rejects(
      commands.get('mheai').handler({ chat: 'owner@s.whatsapp.net', args: ['on'] }),
      /Ajoute MHE_AI_API_KEY ou OPENAI_API_KEY aux variables secrètes/,
    );
    assert.equal(settings.mheai.enabled, false);
  } finally {
    if (oldMhe === undefined) delete process.env.MHE_AI_API_KEY; else process.env.MHE_AI_API_KEY = oldMhe;
    if (oldOpenAi === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldOpenAi;
  }
});

test('ghost command validates its delay and requires a message', async () => {
  const { commands } = setup();
  await assert.rejects(
    commands.get('mheghost').handler({ chat: 'chat@s.whatsapp.net', args: ['2', 'Salut'] }),
    /5 à 60 secondes/,
  );
  await assert.rejects(
    commands.get('mheghost').handler({ chat: 'chat@s.whatsapp.net', args: ['10'] }),
    /5 à 60 secondes/,
  );
});

test('synthetic voice command rejects missing text and unsupported subcommands', async () => {
  const { commands } = setup();
  await assert.rejects(
    commands.get('mheclone').handler({ chat: 'chat@s.whatsapp.net', args: ['clone', 'Bonjour'] }),
    /Utilise \.mheclone vocal/,
  );
  await assert.rejects(
    commands.get('mheclone').handler({ chat: 'chat@s.whatsapp.net', args: ['vocal'] }),
    /Utilise \.mheclone vocal/,
  );
});
