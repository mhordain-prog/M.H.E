const AI_REPLY_COOLDOWN_MS = 30_000;
const AI_MAX_DAILY_REPLIES = 12;
const GHOST_MAX_SECONDS = 60;
const TTS_MAX_CHARS = 600;
const aiCooldowns = new Map();
const aiDailyCounts = new Map();

function ensureGoldSettings(settings) {
  if (!settings.mheai || typeof settings.mheai !== 'object') {
    settings.mheai = { enabled: false, systemPrompt: 'Tu es M.H.E., un assistant WhatsApp utile, respectueux et concis. Réponds en français sauf si la personne écrit dans une autre langue. Ne prétends pas être une personne humaine.' };
  }
  if (typeof settings.mheai.enabled !== 'boolean') settings.mheai.enabled = false;
  if (typeof settings.mheai.systemPrompt !== 'string') {
    settings.mheai.systemPrompt = 'Tu es M.H.E., un assistant WhatsApp utile, respectueux et concis. Réponds en français sauf si la personne écrit dans une autre langue. Ne prétends pas être une personne humaine.';
  }
  return settings.mheai;
}

function isPrivateChat(jid = '') {
  return jid.endsWith('@s.whatsapp.net') || jid.endsWith('@lid');
}

function getText(message) {
  const content = message?.message || {};
  return content.conversation
    || content.extendedTextMessage?.text
    || content.imageMessage?.caption
    || content.videoMessage?.caption
    || content.documentMessage?.caption
    || '';
}

function cleanSender(jid = '') {
  return jid.split('@')[0].split(':')[0];
}

async function openAIChatReply(text, systemPrompt) {
  const apiKey = process.env.MHE_AI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('MHE_AI_API_KEY ou OPENAI_API_KEY doit être configurée dans les variables secrètes.');
  const endpoint = (process.env.MHE_AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const model = process.env.MHE_AI_MODEL || 'gpt-4o-mini';
  const response = await fetch(`${endpoint}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text.slice(0, 3000) },
      ],
      max_tokens: 300,
      temperature: 0.7,
    }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`Fournisseur IA indisponible (HTTP ${response.status}) : ${detail}`);
  }
  const data = await response.json();
  const reply = data.choices?.[0]?.message?.content;
  if (typeof reply !== 'string' || !reply.trim()) throw new Error('Le fournisseur IA a renvoyé une réponse vide.');
  return reply.trim().slice(0, 3500);
}

async function synthesizeOriginalVoice(text) {
  const apiKey = process.env.MHE_TTS_API_KEY || process.env.MHE_AI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('Configure MHE_TTS_API_KEY (ou OPENAI_API_KEY) dans les variables secrètes de l’hébergement.');
  const endpoint = (process.env.MHE_TTS_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const model = process.env.MHE_TTS_MODEL || 'gpt-4o-mini-tts';
  const voice = process.env.MHE_TTS_VOICE || 'coral';
  const response = await fetch(`${endpoint}/audio/speech`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      voice,
      input: text.slice(0, TTS_MAX_CHARS),
      instructions: 'Use a clear, natural French voice. This is an original synthetic voice, not an imitation of a real person.',
      response_format: 'mp3',
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 250);
    throw new Error(`Le service de voix synthétique a répondu HTTP ${response.status} : ${detail}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length || buffer.length > 12 * 1024 * 1024) throw new Error('Le fichier audio reçu est vide ou trop volumineux.');
  return buffer;
}

export function registerMheGoldV2({ register, sendText, settings, saveSettings, getSocket, getPrefix }) {
  ensureGoldSettings(settings);

  register('mheai', 'M.H.E GOLD V2', 'Activer, désactiver ou consulter l’assistant IA privé', async ({ chat, args }) => {
    const state = ensureGoldSettings(settings);
    const action = (args[0] || 'status').toLowerCase();
    if (action === 'on') {
      if (!(process.env.MHE_AI_API_KEY || process.env.OPENAI_API_KEY)) {
        throw new Error('Ajoute MHE_AI_API_KEY ou OPENAI_API_KEY aux variables secrètes avant d’activer l’IA.');
      }
      state.enabled = true;
      await saveSettings();
      await sendText(chat, '🤖 M.H.E AI activé. Réponses automatiques uniquement en conversation privée, avec limites anti-spam. Les messages privés reçus seront envoyés au fournisseur IA configuré.');
      return;
    }
    if (action === 'off') {
      state.enabled = false;
      await saveSettings();
      await sendText(chat, '🛑 M.H.E AI désactivé.');
      return;
    }
    if (action === 'status') {
      await sendText(chat, `🤖 M.H.E AI : ${state.enabled ? 'activé' : 'désactivé'}\nClé API : ${(process.env.MHE_AI_API_KEY || process.env.OPENAI_API_KEY) ? 'configurée' : 'absente'}\nRéponses : privé uniquement, max ${AI_MAX_DAILY_REPLIES}/contact/jour.`);
      return;
    }
    if (action === 'message') {
      const prompt = args.slice(1).join(' ').trim();
      if (!prompt || prompt.length > 800) throw new Error(`Utilise ${getPrefix()}mheai message ton instruction (800 caractères maximum).`);
      state.systemPrompt = prompt;
      await saveSettings();
      await sendText(chat, '✅ Instruction personnalisée enregistrée. Elle sera utilisée par l’assistant IA.');
      return;
    }
    throw new Error(`Utilise ${getPrefix()}mheai on, off, status ou message ton_instruction.`);
  }, true);

  register('mheghost', 'M.H.E GOLD V2', 'Envoyer un message que le bot tentera de supprimer après un délai', async ({ chat, args }) => {
    const seconds = Number(args[0]);
    const text = args.slice(1).join(' ').trim();
    if (!Number.isInteger(seconds) || seconds < 5 || seconds > GHOST_MAX_SECONDS || !text) {
      throw new Error(`Utilise ${getPrefix()}mheghost 10 ton message (5 à ${GHOST_MAX_SECONDS} secondes).`);
    }
    if (text.length > 1500) throw new Error('Le message est trop long (1500 caractères maximum).');
    const socket = getSocket();
    if (!socket) throw new Error('La connexion WhatsApp n’est pas prête.');
    const sent = await socket.sendMessage(chat, {
      text: `👻 MESSAGE FANTÔME — suppression prévue dans ${seconds} secondes.\n\n${text}\n\n⚠️ Message généré par bot : la suppression n’empêche pas les captures ou copies.`,
    });
    const timer = setTimeout(async () => {
      try {
        if (sent?.key) await socket.sendMessage(chat, { delete: sent.key });
      } catch (error) {
        console.warn('[MHE GHOST] Suppression non confirmée :', error?.message || error);
      }
    }, seconds * 1000);
    timer.unref?.();
  });

  register('mheclone', 'M.H.E GOLD V2', 'Générer une voix synthétique originale : .mheclone vocal texte', async ({ chat, args }) => {
    const subcommand = (args[0] || '').toLowerCase();
    const text = args.slice(1).join(' ').trim();
    if (subcommand !== 'vocal' || !text) {
      throw new Error(`Utilise ${getPrefix()}mheclone vocal Bonjour, ceci est une voix synthétique de M.H.E.`);
    }
    if (text.length > TTS_MAX_CHARS) throw new Error(`Le texte est limité à ${TTS_MAX_CHARS} caractères.`);
    const socket = getSocket();
    if (!socket) throw new Error('La connexion WhatsApp n’est pas prête.');
    await sendText(chat, '🎙️ Génération en cours. Avis : la voix envoyée sera synthétique et générée par IA, pas la voix réelle d’une personne.');
    const audio = await synthesizeOriginalVoice(text);
    await socket.sendMessage(chat, {
      audio,
      mimetype: 'audio/mpeg',
      fileName: 'mhe-voice-ai.mp3',
      ptt: false,
    });
  });

  return async function handleMheGoldIncoming(message, { mode }) {
    const state = ensureGoldSettings(settings);
    if (!state.enabled || mode === 'disabled' || !message?.message || message.key?.fromMe) return false;
    const chat = message.key?.remoteJid || '';
    if (!isPrivateChat(chat) || chat === 'status@broadcast') return false;
    const text = getText(message).trim();
    if (!text || text.startsWith(getPrefix())) return false;
    const sender = cleanSender(message.key?.participant || chat);
    const now = Date.now();
    const lastReply = aiCooldowns.get(sender) || 0;
    if (now - lastReply < AI_REPLY_COOLDOWN_MS) return true;
    const day = new Date(now).toISOString().slice(0, 10);
    const countKey = `${day}:${sender}`;
    const count = aiDailyCounts.get(countKey) || 0;
    if (count >= AI_MAX_DAILY_REPLIES) return true;
    if (aiDailyCounts.size > 5000) {
      for (const key of aiDailyCounts.keys()) if (!key.startsWith(`${day}:`)) aiDailyCounts.delete(key);
    }
    if (aiCooldowns.size > 5000) {
      for (const [key, timestamp] of aiCooldowns) if (now - timestamp > 24 * 60 * 60 * 1000) aiCooldowns.delete(key);
    }
    aiCooldowns.set(sender, now);
    aiDailyCounts.set(countKey, count + 1);
    try {
      const reply = await openAIChatReply(text, state.systemPrompt);
      await sendText(chat, `🤖 M.H.E AI (réponse générée par IA)\n\n${reply}`);
    } catch (error) {
      console.warn('[MHE AI] Réponse automatique impossible :', error?.message || error);
      await sendText(chat, '⚠️ M.H.E AI n’a pas pu répondre pour le moment. Réessaie plus tard.');
    }
    return true;
  };
}
