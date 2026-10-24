import test from 'node:test';
import assert from 'node:assert/strict';
import { registerAnimeQuiz, handleAnimeQuizIncoming, resetAnimeQuizForTests } from '../core/anime-quiz.js';

function setup() {
  const commands = new Map();
  const sent = [];
  registerAnimeQuiz({
    register: (name, category, description, handler) => commands.set(name, { name, category, description, handler }),
    sendText: async (chat, text) => sent.push({ chat, text }),
    getPrefix: () => '.',
  });
  return { commands, sent };
}

test('registers quiz command and starts a quiz with A/B/C/D choices', async () => {
  resetAnimeQuizForTests();
  const { commands, sent } = setup();
  assert.ok(commands.has('quiz'));
  await commands.get('quiz').handler({ chat: 'group@g.us', args: ['anime'] });
  assert.match(sent[0].text, /QUIZ ANIME/);
  assert.match(sent[0].text, /A\)/);
  assert.match(sent[0].text, /B\)/);
  assert.match(sent[0].text, /C\)/);
  assert.match(sent[0].text, /D\)/);
});

test('accepts a letter answer and sends the next question', async () => {
  resetAnimeQuizForTests();
  const { commands, sent } = setup();
  await commands.get('quiz').handler({ chat: 'chat@s.whatsapp.net', args: ['anime'] });
  const handled = await handleAnimeQuizIncoming({
    key: { remoteJid: 'chat@s.whatsapp.net', fromMe: false },
    message: { conversation: 'A' },
  }, { sendText: async (chat, text) => sent.push({ chat, text }), getPrefix: () => '.' });
  assert.equal(handled, true);
  assert.match(sent.at(-1).text, /Question 2/);
});

test('does not consume ordinary text when no quiz is active', async () => {
  resetAnimeQuizForTests();
  const handled = await handleAnimeQuizIncoming({
    key: { remoteJid: 'nobody@s.whatsapp.net', fromMe: false },
    message: { conversation: 'Bonjour' },
  }, { sendText: async () => {}, getPrefix: () => '.' });
  assert.equal(handled, false);
});
