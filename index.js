import 'dotenv/config';
import express from 'express';
import pino from 'pino';
import fs from 'node:fs/promises';
import path from 'node:path';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';

const PORT = Number(process.env.PORT || 3000);
const PREFIX = process.env.PREFIX || '.';
const BOT_NAME = process.env.BOT_NAME || 'M.H.E.';
const SESSION_DIR = process.env.SESSION_DIR || './sessions';
const SETTINGS_FILE = process.env.SETTINGS_FILE || './data/settings.json';
const OWNER_NUMBERS = new Set(
  (process.env.OWNER_NUMBERS || '')
    .split(',')
    .map((value) => value.replace(/\D/g, ''))
    .filter(Boolean),
);
const logger = pino({ level: process.env.LOG_LEVEL || 'warn' });
const STARTED_AT = Date.now();
const DISPLAY_OWNER = process.env.OWNER_NAME || 'HORDAIN MADILA';
const BOT_VERSION = process.env.BOT_VERSION || '3.0 NO STRESS';
function formatUptime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [days ? `${days}j` : '', hours ? `${hours}h` : '', minutes ? `${minutes}m` : '', `${seconds}s`].filter(Boolean).join(' ');
}
const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '2kb' }));
app.get('/', (_req, res) => res.sendFile(path.resolve('index.html')));

let socket;
let authState;
let saveCreds;
let reconnectTimer;
let mode = process.env.BOT_MODE === 'public' ? 'public' : 'private';
let settings = { groups: {} };
let pairCooldownUntil = 0;
const pairIpCooldowns = new Map();
const PAIR_COOLDOWN_MS = 45_000;
const commands = new Map();

async function loadSettings() {
  try {
    const parsed = JSON.parse(await fs.readFile(SETTINGS_FILE, 'utf8'));
    settings = { groups: {}, ...parsed, groups: parsed.groups || {} };
    if (parsed.mode === 'public' || parsed.mode === 'private') mode = parsed.mode;
  } catch (error) {
    if (error.code !== 'ENOENT') logger.warn({ err: error }, 'Settings could not be read; using defaults');
  }
}
async function saveSettings() {
  await fs.mkdir(path.dirname(SETTINGS_FILE), { recursive: true });
  await fs.writeFile(SETTINGS_FILE, JSON.stringify({ ...settings, mode }, null, 2));
}
function register(name, category, description, handler, ownerOnly = false) {
  commands.set(name, { name, category, description, handler, ownerOnly });
}
function getGroupSettings(jid) {
  settings.groups[jid] ||= { welcome: false, goodbye: false };
  return settings.groups[jid];
}
function cleanNumber(jid = '') {
  return jid.split('@')[0].split(':')[0].replace(/\D/g, '');
}
function senderJid(message) {
  return message.key.participant || message.key.remoteJid || '';
}
function messageText(message) {
  const content = message.message || {};
  return content.conversation
    || content.extendedTextMessage?.text
    || content.imageMessage?.caption
    || content.videoMessage?.caption
    || content.documentMessage?.caption
    || '';
}
function mentionedJids(message) {
  const content = message.message || {};
  return content.extendedTextMessage?.contextInfo?.mentionedJid || [];
}
function quotedParticipant(message) {
  return message.message?.extendedTextMessage?.contextInfo?.participant || null;
}
async function sendText(jid, text, options = {}) {
  if (!socket) throw new Error('WhatsApp socket is not ready');
  return socket.sendMessage(jid, { text, ...options });
}
async function groupContext(jid, actor) {
  const metadata = await socket.groupMetadata(jid);
  const participants = metadata.participants || [];
  const actorNumber = cleanNumber(actor);
  const botNumber = cleanNumber(socket.user?.id || '');
  const actorInfo = participants.find((p) => cleanNumber(p.id) === actorNumber);
  const botInfo = participants.find((p) => cleanNumber(p.id) === botNumber);
  return {
    metadata,
    participants,
    actorIsAdmin: Boolean(actorInfo?.admin || actorInfo?.isAdmin || actorInfo?.isSuperAdmin),
    botIsAdmin: Boolean(botInfo?.admin || botInfo?.isAdmin || botInfo?.isSuperAdmin),
  };
}
function requireGroup(jid) {
  if (!jid.endsWith('@g.us')) throw new Error('Cette commande fonctionne uniquement dans un groupe.');
}
function requireAdmin(context) {
  if (!context.actorIsAdmin) throw new Error('Réservé aux administrateurs du groupe.');
  if (!context.botIsAdmin) throw new Error('M.H.E. doit être administrateur du groupe pour effectuer cette action.');
}
function targetJids(message) {
  const targets = mentionedJids(message);
  if (targets.length) return [...new Set(targets)];
  const quoted = quotedParticipant(message);
  return quoted ? [quoted] : [];
}
async function executeCommand(message, commandName, args, isOwner) {
  const command = commands.get(commandName);
  if (!command) return;
  const chat = message.key.remoteJid;
  const actor = senderJid(message);
  if (mode === 'private' && !isOwner) return;
  if (command.ownerOnly && !isOwner) {
    await sendText(chat, '⛔ Cette commande est réservée au propriétaire du bot.');
    return;
  }
  try {
    await command.handler({ message, chat, actor, args, isOwner });
  } catch (error) {
    logger.warn({ err: error, command: commandName }, 'Command failed');
    await sendText(chat, `⚠️ ${error.message || 'La commande a échoué.'}`);
  }
}

register('menu', 'GÉNÉRAL', 'Afficher les commandes installées', async ({ chat }) => {
  const categories = new Map();
  for (const command of commands.values()) {
    if (!categories.has(command.category)) categories.set(command.category, []);
    categories.get(command.category).push(command);
  }
  const lines = [
    `╭┈───〔 ꧁༒ ${BOT_NAME} ༒꧂ 〕┈───⊷`,
    '┃',
    `├✦ 👑 Owner : ${DISPLAY_OWNER}`,
    `├✦ ⚡ Commands : ${commands.size}`,
    `├✦ ⏱️ Runtime : ${formatUptime(Date.now() - STARTED_AT)}`,
    `├✦ 🔰 Prefix : ${PREFIX}`,
    `├✦ 🔒 Mode : ${mode.toUpperCase()}`,
    `├✦ 🩸 Version : ${BOT_VERSION}`,
    '┃',
    '╰━━━━━━━━━━━━━━━━━━⊷',
    '',
    '「 THE FINAL BOSS 」',
    'M.H.E. — Toujours en évolution.',
    '',
  ];
  for (const [category, items] of categories) {
    lines.push(`╭─〔 ${category} 〕`);
    for (const item of items) lines.push(`│ ${PREFIX}${item.name} — ${item.description}`);
    lines.push('╰────────────');
  }
  lines.push('', 'Le compteur affiche uniquement les commandes réellement enregistrées.');
  await sendText(chat, lines.join('\\n'));
});
register('help', 'GÉNÉRAL', 'Afficher l’aide', async ({ chat }) => {
  await sendText(chat, `Utilise ${PREFIX}menu pour voir les ${commands.size} commandes actuellement enregistrées.`);
});
register('ping', 'GÉNÉRAL', 'Vérifier si le bot répond', async ({ chat }) => {
  await sendText(chat, '🏓 M.H.E. répond. Le processus WhatsApp est actif.');
});
register('alive', 'GÉNÉRAL', 'État du bot', async ({ chat }) => {
  await sendText(chat, `✅ ${BOT_NAME} est démarré. Mode : ${mode}. Commandes actives : ${commands.size}.`);
});
register('owner', 'GÉNÉRAL', 'Afficher le propriétaire connecté', async ({ chat }) => {
  const owner = cleanNumber(socket?.user?.id || '');
  await sendText(chat, owner ? `👑 Compte WhatsApp propriétaire connecté : +${owner}` : 'Le compte propriétaire n’est pas encore connecté.');
});
register('mode', 'PROPRIÉTAIRE', 'Utilisation : .mode private ou .mode public', async ({ chat, args }) => {
  const next = (args[0] || '').toLowerCase();
  if (!['private', 'public'].includes(next)) {
    await sendText(chat, `Mode actuel : ${mode}. Utilise ${PREFIX}mode private ou ${PREFIX}mode public.`);
    return;
  }
  mode = next;
  await saveSettings();
  await sendText(chat, `✅ Mode modifié : ${mode}.`);
}, true);
register('tagall', 'GROUPES', 'Mentionner les membres du groupe', async ({ chat, actor, message, args }) => {
  requireGroup(chat);
  const context = await groupContext(chat, actor);
  requireAdmin(context);
  const mentions = context.participants.map((p) => p.id).filter(Boolean);
  const text = args.join(' ') || 'Mention générale';
  await sendText(chat, `📣 ${text}\n\n${mentions.map((jid) => `• @${cleanNumber(jid)}`).join('\n')}`, { mentions });
});
for (const action of ['kick', 'promote', 'demote']) {
  register(action, 'GROUPES', `${action === 'kick' ? 'Retirer' : action === 'promote' ? 'Promouvoir' : 'Rétrograder'} un membre (mention ou réponse)`, async ({ chat, actor, message }) => {
    requireGroup(chat);
    const context = await groupContext(chat, actor);
    requireAdmin(context);
    const targets = targetJids(message);
    if (!targets.length) throw new Error('Mentionne un membre ou réponds à son message.');
    const botNumber = cleanNumber(socket.user?.id || '');
    if (targets.some((jid) => cleanNumber(jid) === botNumber)) throw new Error('Cette action ne peut pas cibler le bot lui-même.');
    await socket.groupParticipantsUpdate(chat, targets, action === 'kick' ? 'remove' : action);
    await sendText(chat, `✅ Action ${action} effectuée pour ${targets.length} membre(s).`);
  });
}
for (const feature of ['welcome', 'goodbye']) {
  register(feature, 'GROUPES', `Activer/désactiver les messages ${feature === 'welcome' ? 'de bienvenue' : 'de départ'} : .${feature} on/off`, async ({ chat, actor, args }) => {
    requireGroup(chat);
    const context = await groupContext(chat, actor);
    requireAdmin(context);
    const value = (args[0] || '').toLowerCase();
    if (!['on', 'off'].includes(value)) throw new Error(`Utilise ${PREFIX}${feature} on ou ${PREFIX}${feature} off.`);
    getGroupSettings(chat)[feature] = value === 'on';
    await saveSettings();
    await sendText(chat, `✅ ${feature} : ${value}.`);
  });
}


register('uptime', 'GÉNÉRAL', 'Afficher le temps de fonctionnement', async ({ chat }) => {
  await sendText(chat, `⏱️ ${BOT_NAME} actif depuis ${formatUptime(Date.now() - STARTED_AT)}.`);
});
register('botinfo', 'GÉNÉRAL', 'Afficher les informations du bot', async ({ chat }) => {
  await sendText(chat, [
    `╭┈──〔 ${BOT_NAME} 〕──┈⊷`,
    `├✦ Propriétaire : ${DISPLAY_OWNER}`,
    `├✦ Version : ${BOT_VERSION}`,
    `├✦ Préfixe : ${PREFIX}`,
    `├✦ Mode : ${mode.toUpperCase()}`,
    `├✦ Commandes enregistrées : ${commands.size}`,
    `├✦ Uptime : ${formatUptime(Date.now() - STARTED_AT)}`,
    '╰━━━━━━━━━━━━━━⊷',
  ].join('\\n'));
});
register('chatid', 'GÉNÉRAL', 'Afficher l’identifiant du chat', async ({ chat }) => {
  await sendText(chat, `🆔 ID du chat : ${chat}`);
});
register('reverse', 'TEXTE', 'Inverser un texte', async ({ chat, args }) => {
  const value = args.join(' ');
  if (!value) throw new Error(`Utilise ${PREFIX}reverse ton texte.`);
  await sendText(chat, Array.from(value).reverse().join(''));
});
register('choose', 'FUN', 'Choisir au hasard parmi des options séparées par |', async ({ chat, args }) => {
  const choices = args.join(' ').split('|').map((s) => s.trim()).filter(Boolean);
  if (choices.length < 2) throw new Error(`Utilise ${PREFIX}choose option A | option B.`);
  await sendText(chat, `🎯 Je choisis : ${choices[Math.floor(Math.random() * choices.length)]}`);
});
register('dice', 'FUN', 'Lancer un dé à six faces', async ({ chat }) => {
  await sendText(chat, `🎲 Résultat : ${1 + Math.floor(Math.random() * 6)}`);
});
register('coin', 'FUN', 'Lancer une pièce', async ({ chat }) => {
  await sendText(chat, `🪙 Résultat : ${Math.random() < 0.5 ? 'Pile' : 'Face'}`);
});


function mapAlphabet(text, upperStart, lowerStart, exceptions = {}) {
  return Array.from(text, (char) => {
    if (exceptions[char]) return exceptions[char];
    const code = char.codePointAt(0);
    if (code >= 65 && code <= 90 && upperStart != null) return String.fromCodePoint(upperStart + code - 65);
    if (code >= 97 && code <= 122 && lowerStart != null) return String.fromCodePoint(lowerStart + code - 97);
    return char;
  }).join('');
}
const fontStyles = [
  (s) => mapAlphabet(s, 0x1D400, 0x1D41A),
  (s) => mapAlphabet(s, 0x1D434, 0x1D44E, { h: 'ℎ' }),
  (s) => mapAlphabet(s, 0x1D468, 0x1D482),
  (s) => mapAlphabet(s, 0x1D5D4, 0x1D5EE),
  (s) => mapAlphabet(s, 0x1D608, 0x1D622),
  (s) => mapAlphabet(s, 0x1D63C, 0x1D656),
  (s) => mapAlphabet(s, 0x1D670, 0x1D68A),
  (s) => mapAlphabet(s, 0x1D538, 0x1D552, { C: 'ℂ', H: 'ℍ', N: 'ℕ', P: 'ℙ', Q: 'ℚ', R: 'ℝ', Z: 'ℤ' }),
  (s) => mapAlphabet(s, 0x1D504, 0x1D51E, { C: 'ℭ', H: 'ℌ', I: 'ℑ', R: 'ℜ', Z: 'ℨ', e: 'ℯ', g: 'ℊ', o: 'ℴ' }),
  (s) => mapAlphabet(s, 0x1D6A8, 0x1D6C2),
  (s) => s.toUpperCase().split('').join(' '),
  (s) => Array.from(s, (ch) => /[A-Za-z]/.test(ch) ? String.fromCodePoint(0x24B6 + (ch.toUpperCase().charCodeAt(0) - 65)) : ch).join(''),
];
function registerFontCommands() {
  fontStyles.forEach((transform, index) => {
    const number = index + 1;
    register(`font${number}`, 'TEXTE / POLICES', `Convertir le texte en style décoratif ${number}`, async ({ chat, args }) => {
      const value = args.join(' ');
      if (!value) throw new Error(`Utilise ${PREFIX}font${number} ton texte.`);
      await sendText(chat, transform(value));
    });
  });
  register('font', 'TEXTE / POLICES', 'Utilisation : .font numéro texte (styles 1 à 12)', async ({ chat, args }) => {
    const number = Number(args[0]);
    const value = args.slice(1).join(' ');
    if (!Number.isInteger(number) || number < 1 || number > fontStyles.length || !value) {
      throw new Error(`Utilise ${PREFIX}font 1 ton texte (styles disponibles : 1 à ${fontStyles.length}).`);
    }
    await sendText(chat, fontStyles[number - 1](value));
  });
}
registerFontCommands();

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    name: BOT_NAME,
    whatsapp: socket?.user ? 'connected' : 'waiting',
    registered: Boolean(authState?.creds?.registered),
    commands: commands.size,
    mode,
  });
});
app.post('/api/pair', async (req, res) => {
  const now = Date.now();
  const ip = req.ip || 'unknown';
  const lastIpRequest = pairIpCooldowns.get(ip) || 0;
  if (now < pairCooldownUntil || now - lastIpRequest < PAIR_COOLDOWN_MS) {
    return res.status(429).json({ error: 'Attends quelques secondes avant de demander un nouveau code.' });
  }
  const number = String(req.body?.number || '').replace(/\D/g, '');
  if (number.length < 10 || number.length > 15) {
    return res.status(400).json({ error: 'Entre ton numéro avec l’indicatif du pays, chiffres uniquement.' });
  }
  if (!socket || !authState || authState.creds.registered) {
    return res.status(409).json({ error: 'Le bot est déjà lié ou le service WhatsApp n’est pas prêt.' });
  }
  try {
    pairCooldownUntil = now + PAIR_COOLDOWN_MS;
    pairIpCooldowns.set(ip, now);
    const code = await socket.requestPairingCode(number);
    return res.json({ code: String(code).match(/.{1,4}/g)?.join('-') || String(code) });
  } catch (error) {
    logger.warn({ err: error }, 'Pairing request failed');
    pairCooldownUntil = 0;
    return res.status(503).json({ error: 'Impossible de générer le code pour le moment. Réessaie plus tard.' });
  }
});
app.get('/api/status', (_req, res) => {
  res.json({ connected: Boolean(socket?.user), registered: Boolean(authState?.creds?.registered) });
});
const server = app.listen(PORT, '0.0.0.0', () => logger.info({ port: PORT }, 'M.H.E. web server started'));

async function startWhatsApp() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  await fs.mkdir(SESSION_DIR, { recursive: true });
  const auth = await useMultiFileAuthState(SESSION_DIR);
  authState = auth.state;
  saveCreds = auth.saveCreds;
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));
  socket = makeWASocket({
    auth: authState,
    version,
    logger,
    printQRInTerminal: false,
    browser: ['M.H.E.', 'Chrome', '1.0.0'],
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });
  socket.ev.on('creds.update', saveCreds);
  socket.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'open') logger.info('WhatsApp connected');
    if (connection === 'close') {
      socket = undefined;
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      if (statusCode !== DisconnectReason.loggedOut) {
        reconnectTimer = setTimeout(() => startWhatsApp().catch((err) => logger.error({ err }, 'Reconnect failed')), 3000);
      } else {
        logger.error('WhatsApp session logged out. Remove the session only if you intend to pair again.');
      }
    }
  });
  socket.ev.on('group-participants.update', async (event) => {
    try {
      const group = getGroupSettings(event.id);
      if (event.action === 'add' && group.welcome) {
        const mentions = event.participants || [];
        await sendText(event.id, `👋 Bienvenue ${mentions.map((jid) => `@${cleanNumber(jid)}`).join(', ')} !`, { mentions });
      }
      if (event.action === 'remove' && group.goodbye) {
        const mentions = event.participants || [];
        await sendText(event.id, `👋 ${mentions.map((jid) => `@${cleanNumber(jid)}`).join(', ')} a quitté le groupe.`, { mentions });
      }
    } catch (error) {
      logger.warn({ err: error }, 'Group participant event failed');
    }
  });
  socket.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const message of messages) {
      if (!message.message || message.key.remoteJid === 'status@broadcast') continue;
      const text = messageText(message).trim();
      if (!text.startsWith(PREFIX)) continue;
      const [name, ...args] = text.slice(PREFIX.length).trim().split(/\s+/);
      if (!name) continue;
      const actor = senderJid(message);
      const actorNumber = cleanNumber(actor);
      const connectedOwnerNumber = cleanNumber(socket?.user?.id || '');
      const isOwner = Boolean(message.key.fromMe)
        || (connectedOwnerNumber && actorNumber === connectedOwnerNumber)
        || OWNER_NUMBERS.has(actorNumber);
      await executeCommand(message, name.toLowerCase(), args, isOwner);
    }
  });
}

await loadSettings();
await startWhatsApp().catch((error) => logger.error({ err: error }, 'WhatsApp startup failed'));
process.on('SIGTERM', async () => {
  server.close();
  try { socket?.end(undefined); } catch {}
  process.exit(0);
});
