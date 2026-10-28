import 'dotenv/config';
import express from 'express';
import pino from 'pino';
import { registerMheGoldV2 } from './core/mhe-gold-v2.js';
import { createWarningManager } from './core/warnings.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';

const PORT = Number(process.env.PORT || 3000);
let PREFIX = process.env.PREFIX || '.';
let BOT_NAME = process.env.BOT_NAME || 'M.H.E-MD GOLD';
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
let DISPLAY_OWNER = process.env.OWNER_NAME || 'HORDAIN MADILA';
const BOT_VERSION = process.env.BOT_VERSION || '1.0.0 GOLD';
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
let settings = { groups: {}, sudo: [], banned: [], welcome: true, goodbye: true, antilink: false, antispam: false, antistatusmention: false, autoread: true, autotyping: true, autoreact: true };
let pairCooldownUntil = 0;
const pairIpCooldowns = new Map();
const PAIR_COOLDOWN_MS = 45_000;
const commands = new Map();
const recentGroupMessages = new Map();
let activitySinceSave = 0;

async function loadSettings() {
  try {
    const parsed = JSON.parse(await fs.readFile(SETTINGS_FILE, 'utf8'));
    settings = { groups: {}, sudo: [], banned: [], welcome: true, goodbye: true, antilink: false, antispam: false, antistatusmention: false, autoread: true, autotyping: true, autoreact: true, ...parsed, groups: parsed.groups || {} };
    if (parsed.mode === 'public' || parsed.mode === 'private') mode = parsed.mode;
    if (typeof parsed.prefix === 'string' && parsed.prefix.length > 0 && parsed.prefix.length <= 3) PREFIX = parsed.prefix;
    if (typeof parsed.botname === 'string' && parsed.botname.trim()) BOT_NAME = parsed.botname;
    if (typeof parsed.ownername === 'string' && parsed.ownername.trim()) DISPLAY_OWNER = parsed.ownername;
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
  if (!context.actorIsAdmin) {
    throw new Error('⛔ Cette commande est réservée aux administrateurs du groupe.');
  }
  if (!context.botIsAdmin) {
    throw new Error(
      '⚠️ M.H.E-MD GOLD doit être administrateur pour effectuer cette action.\n\n' +
      'Pour le promouvoir :\n' +
      '1. Ouvre les informations du groupe.\n' +
      '2. Va dans la liste des participants.\n' +
      '3. Sélectionne M.H.E-MD GOLD.\n' +
      '4. Choisis « Nommer administrateur ».\n\n' +
      'Puis réessaie la commande.'
    );
  }
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
    if (settings.autoreact !== false && message.key?.id && socket) {
      try {
        await socket.sendMessage(chat, { react: { text: '⚡', key: message.key } });
      } catch (reactionError) {
        logger.debug({ err: reactionError, command: commandName }, 'Automatic command reaction failed');
      }
    }
  } catch (error) {
    logger.warn({ err: error, command: commandName }, 'Command failed');
    await sendText(chat, `⚠️ ${error.message || 'La commande a échoué.'}`);
  }
}

register('menu', 'GÉNÉRAL', 'Afficher le menu GOLD et les commandes réellement enregistrées', async ({ chat }) => {
  const categories = new Map();
  for (const command of commands.values()) {
    if (!categories.has(command.category)) categories.set(command.category, []);
    categories.get(command.category).push(command);
  }
  const lines = [
    '╔════════◇◆◇════════╗',
    '       👑 M.H.E-MD GOLD 👑',
    '       ✨ GOLDEN BOT SYSTEM ✨',
    '       ULTRA LUXURY MENU',
    '╠════════════════════╣',
    '👑 Propriétaire : ' + DISPLAY_OWNER,
    '🕒 Date : ' + new Date().toLocaleString('fr-FR'),
    '⏱️ Uptime : ' + formatUptime(Date.now() - STARTED_AT),
    '⚡ Version : ' + BOT_VERSION,
    '📚 Commandes : ' + commands.size,
    '🔖 Préfixe : ' + PREFIX,
    '🔒 Mode : ' + mode.toUpperCase(),
    '╚════════════════════╝',
    '',
  ];
  for (const [category, items] of categories) {
    lines.push('╔═══════ 👑 ' + category + ' 👑 ═══════╗');
    for (const item of items) lines.push('║ ➣ ' + PREFIX + item.name);
    lines.push('╚════════════════════════════╝', '');
  }
  lines.push(
    '╔══════════ ABOUT MHE ══════════╗',
    '💛 M.H.E-MD GOLD — Gold Luxury Edition',
    '👑 Creator : ' + DISPLAY_OWNER,
    '⚡ Rapide • Fiable • Multifonction',
    '╚════════════════════════════════╝'
  );
  const menuText = lines.join('\n');
  // Envoie la photo de profil WhatsApp du bot avec le menu en légende.
  try {
    const botJid = socket && socket.user && socket.user.id;
    if (!botJid) throw new Error('WhatsApp profile is not ready');
    const profileUrl = await socket.profilePictureUrl(botJid, 'image');
    await socket.sendMessage(chat, { image: { url: profileUrl }, caption: menuText });
  } catch (error) {
    logger.info({ err: error }, 'Profile image unavailable; sending text menu');
    await sendText(chat, menuText);
  }
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



register('actifs', 'GROUPES', 'Classement des 15 membres les plus actifs depuis le démarrage du compteur', async ({ chat }) => {
  requireGroup(chat);
  const group = getGroupSettings(chat);
  const activity = group.activity || {};
  const names = group.activityNames || {};
  const top = Object.entries(activity).sort((a, b) => b[1] - a[1]).slice(0, 15);
  if (!top.length) {
    await sendText(chat, '📊 Pas encore de statistiques. M.H.E compte les messages reçus à partir de son démarrage.');
    return;
  }
  const lines = ['╭───〔 🏆 M.H.E GOLD — ACTIFS 〕───╮'];
  top.forEach(([jid, count], index) => {
    const medal = ['🥇', '🥈', '🥉'][index] || `${index + 1}.`;
    lines.push(`${medal} ${names[jid] || '@' + cleanNumber(jid)} — ${count} message(s)`);
  });
  lines.push('╰──────────────────────────────╯', '📌 Statistiques comptées depuis le démarrage du compteur.');
  await sendText(chat, lines.join('\n'));
});
register('delall', 'GROUPES', 'Supprimer les messages récents suivis d’un membre non-administrateur (mention ou réponse)', async ({ chat, actor, message }) => {
  requireGroup(chat);
  const context = await groupContext(chat, actor);
  requireAdmin(context);
  const targets = targetJids(message);
  if (targets.length !== 1) throw new Error('Mentionne une seule personne ou réponds à son message.');
  const target = targets[0];
  const targetInfo = context.participants.find((p) => cleanNumber(p.id) === cleanNumber(target));
  if (!targetInfo) throw new Error('Ce membre n’est pas dans le groupe.');
  if (targetInfo.admin || targetInfo.isAdmin || targetInfo.isSuperAdmin) throw new Error('Par sécurité, .delall ne cible pas un administrateur du groupe.');
  const tracked = recentGroupMessages.get(chat) || [];
  const matches = tracked.filter((key) => cleanNumber(key.participant || '') === cleanNumber(target));
  if (!matches.length) throw new Error('Aucun message récent de cette personne n’est suivi depuis le démarrage du bot.');
  let deleted = 0;
  for (const key of matches.slice(-100)) {
    try {
      await socket.sendMessage(chat, { delete: key });
      deleted += 1;
    } catch (error) {
      logger.debug({ err: error, group: chat }, 'Could not delete a tracked group message');
    }
  }
  await sendText(chat, `🗑️ Suppression terminée : ${deleted}/${Math.min(matches.length, 100)} message(s) suivi(s) de @${cleanNumber(target)}.`, { mentions: [target] });
});

const MHE_GROUP_GOLD_ALIASES = [
  'mhe-group', 'everyone', 'hidetag', 'tag',
  'add', 'mute', 'unmute', 'link', 'revoke', 'ginfo', 'gcinfo', 'gcstatus',
  'updategdesc', 'setdesc', 'updategname', 'setname', 'poll', 'requests',
  'acceptall', 'rejectall', 'del', 'delete', 'out', 'leave',
];
register('everyone', 'GROUPES', 'Mentionner tous les membres', async ({ chat, actor, args }) => {
  requireGroup(chat);
  const context = await groupContext(chat, actor);
  requireAdmin(context);
  const mentions = context.participants.map((p) => p.id).filter(Boolean);
  const body = args.join(' ') || 'Mention générale';
  await sendText(chat, `📣 ${body}\n\n${mentions.map((jid) => `• @${cleanNumber(jid)}`).join('\n')}`, { mentions });
});
register('hidetag', 'GROUPES', 'Mention invisible des membres', async ({ chat, actor, args }) => {
  requireGroup(chat);
  const context = await groupContext(chat, actor);
  requireAdmin(context);
  const mentions = context.participants.map((p) => p.id).filter(Boolean);
  await sendText(chat, args.join(' ') || 'M.H.E', { mentions });
});
register('tag', 'GROUPES', 'Mentionner les membres du groupe', async ({ chat, actor, args }) => {
  requireGroup(chat);
  const context = await groupContext(chat, actor);
  requireAdmin(context);
  const mentions = context.participants.map((p) => p.id).filter(Boolean);
  await sendText(chat, args.join(' ') || 'Membres du groupe', { mentions });
});
register('add', 'GROUPES', 'Ajouter un membre par numéro', async ({ chat, actor, args }) => {
  requireGroup(chat);
  const context = await groupContext(chat, actor);
  requireAdmin(context);
  const number = (args[0] || '').replace(/\D/g, '');
  if (number.length < 7 || number.length > 15) throw new Error(`Utilise ${PREFIX}add numéro_international`);
  await socket.groupParticipantsUpdate(chat, [`${number}@s.whatsapp.net`], 'add');
  await sendText(chat, '📨 Demande d’ajout transmise à WhatsApp. Le résultat dépend des paramètres et restrictions du groupe.');
});
for (const action of ['mute', 'unmute']) {
  register(action, 'GROUPES', action === 'mute' ? 'Fermer le groupe aux membres' : 'Ouvrir le groupe aux membres', async ({ chat, actor }) => {
    requireGroup(chat);
    const context = await groupContext(chat, actor);
    requireAdmin(context);
    await socket.groupSettingUpdate(chat, action === 'mute' ? 'announcement' : 'not_announcement');
    await sendText(chat, action === 'mute' ? '🔒 Le groupe est maintenant réservé aux administrateurs pour envoyer des messages.' : '🔓 Les membres peuvent de nouveau envoyer des messages.');
  });
}
register('link', 'GROUPES', 'Afficher le lien d’invitation du groupe', async ({ chat, actor }) => {
  requireGroup(chat);
  const context = await groupContext(chat, actor);
  requireAdmin(context);
  const code = await socket.groupInviteCode(chat);
  await sendText(chat, `🔗 Lien du groupe : https://chat.whatsapp.com/${code}`);
});
register('revoke', 'GROUPES', 'Révoquer le lien d’invitation', async ({ chat, actor }) => {
  requireGroup(chat);
  const context = await groupContext(chat, actor);
  requireAdmin(context);
  await socket.groupRevokeInvite(chat);
  const code = await socket.groupInviteCode(chat);
  await sendText(chat, `✅ Ancien lien révoqué. Nouveau lien : https://chat.whatsapp.com/${code}`);
});
register('groupe', 'GROUPES', 'Vérifier le statut administrateur de M.H.E : .groupe statut', async ({ chat, actor, args }) => {
  requireGroup(chat);
  if ((args[0] || '').toLowerCase() !== 'statut') {
    throw new Error(`Utilise ${PREFIX}groupe statut.`);
  }
  const context = await groupContext(chat, actor);
  const botStatus = context.botIsAdmin
    ? '✅ M.H.E-MD GOLD est administrateur du groupe.'
    : '⚠️ M.H.E-MD GOLD n’est pas administrateur du groupe. Un administrateur doit le promouvoir dans les informations du groupe.';
  const actorStatus = context.actorIsAdmin
    ? '✅ Tu es administrateur du groupe.'
    : 'ℹ️ Ton compte n’est pas administrateur du groupe.';
  await sendText(chat, `╭┈───〔 M.H.E ADMIN CHECK 〕┈───⊷\n${botStatus}\n${actorStatus}\n╰━━━━━━━━━━━━━━━━━━━━⊷`);
});
for (const alias of ['ginfo', 'gcinfo', 'gcstatus']) {
  register(alias, 'GROUPES', 'Afficher les informations du groupe', async ({ chat }) => {
    requireGroup(chat);
    const meta = await socket.groupMetadata(chat);
    const admins = (meta.participants || []).filter((p) => p.admin || p.isAdmin || p.isSuperAdmin).length;
    const created = meta.creation ? new Date(meta.creation * 1000).toLocaleDateString('fr-FR') : 'inconnue';
    await sendText(chat, [
      '╭┈───〔 M.H.E GROUP INFO 〕┈───⊷',
      `├ Nom : ${meta.subject || 'inconnu'}`,
      `├ ID : ${meta.id}`,
      `├ Membres : ${meta.participants?.length || 0}`,
      `├ Administrateurs : ${admins}`,
      `├ Création : ${created}`,
      `╰ Description : ${meta.desc || 'Aucune'}`,
    ].join('\n'));
  });
}
for (const [alias, operation] of [['updategdesc', 'description'], ['setdesc', 'description'], ['updategname', 'name'], ['setname', 'name']]) {
  register(alias, 'GROUPES', operation === 'description' ? 'Modifier la description du groupe' : 'Modifier le nom du groupe', async ({ chat, actor, args }) => {
    requireGroup(chat);
    const context = await groupContext(chat, actor);
    requireAdmin(context);
    const value = args.join(' ').trim();
    if (!value) throw new Error(operation === 'description' ? `Utilise ${PREFIX}${alias} nouvelle description` : `Utilise ${PREFIX}${alias} nouveau nom`);
    if (operation === 'description') await socket.groupUpdateDescription(chat, value);
    else await socket.groupUpdateSubject(chat, value);
    await sendText(chat, operation === 'description' ? '✅ Description du groupe mise à jour.' : '✅ Nom du groupe mis à jour.');
  });
}
register('poll', 'GROUPES', 'Créer un sondage : question | option 1 | option 2', async ({ chat, args }) => {
  requireGroup(chat);
  const [question, ...options] = args.join(' ').split('|').map((part) => part.trim()).filter(Boolean);
  if (!question || options.length < 2) throw new Error(`Utilise ${PREFIX}poll Question | Option 1 | Option 2`);
  if (options.length > 12) throw new Error('WhatsApp limite le sondage à 12 options.');
  await socket.sendMessage(chat, { poll: { name: question, values: options, selectableCount: 1 } });
});
register('requests', 'GROUPES', 'Lister les demandes d’adhésion en attente', async ({ chat, actor }) => {
  requireGroup(chat);
  const context = await groupContext(chat, actor);
  requireAdmin(context);
  const requests = await socket.groupRequestParticipantsList(chat);
  await sendText(chat, requests.length
    ? `Demandes en attente : ${requests.length}\n${requests.map((r, i) => `${i + 1}. ${r.jid}`).join('\n')}`
    : 'Aucune demande d’adhésion en attente.');
});
for (const action of ['acceptall', 'rejectall']) {
  register(action, 'GROUPES', action === 'acceptall' ? 'Accepter les demandes d’adhésion' : 'Refuser les demandes d’adhésion', async ({ chat, actor }) => {
    requireGroup(chat);
    const context = await groupContext(chat, actor);
    requireAdmin(context);
    const requests = await socket.groupRequestParticipantsList(chat);
    let completed = 0;
    for (const request of requests) {
      try {
        await socket.groupRequestParticipantsUpdate(chat, [request.jid], action === 'acceptall' ? 'approve' : 'reject');
        completed += 1;
      } catch (error) {
        logger.warn({ err: error, group: chat }, 'Could not process group join request');
      }
    }
    await sendText(chat, `Traitement terminé : ${completed}/${requests.length} demande(s) ${action === 'acceptall' ? 'acceptée(s)' : 'refusée(s)'}.`);
  });
}
for (const alias of ['del', 'delete']) {
  register(alias, 'GROUPES', 'Supprimer un message envoyé par M.H.E en répondant dessus', async ({ chat, message }) => {
    requireGroup(chat);
    const contextInfo = message.message?.extendedTextMessage?.contextInfo;
    const quotedMessage = contextInfo?.quotedMessage;
    const stanzaId = contextInfo?.stanzaId;
    if (!quotedMessage || !stanzaId) throw new Error('Réponds à un message envoyé par M.H.E.');
    const participant = contextInfo.participant || '';
    const botNumber = cleanNumber(socket.user?.id || '');
    if (!contextInfo.fromMe && cleanNumber(participant) !== botNumber) {
      throw new Error('Par sécurité, cette commande ne supprime que les messages du bot.');
    }
    await socket.sendMessage(chat, {
      delete: { remoteJid: chat, fromMe: true, id: stanzaId, participant: participant || undefined },
    });
  });
}
for (const alias of ['out', 'leave']) {
  register(alias, 'GROUPES', 'Faire quitter le groupe par le bot', async ({ chat, isOwner }) => {
    requireGroup(chat);
    if (!isOwner) throw new Error('Seul le propriétaire du bot peut lui faire quitter un groupe.');
    await socket.groupLeave(chat);
  });
}
register('mhe-group', 'GROUPES', 'Afficher l’aide GROUP GOLD', async ({ chat }) => {
  await sendText(chat, [
    '╭┈───〔 M.H.E GROUP GOLD 〕┈───⊷',
    '├ Mentions : .tagall, .everyone, .hidetag, .tag',
    '├ Membres : .add, .kick, .promote, .demote',
    '├ Réglages : .mute, .unmute, .link, .revoke',
    '├ Infos : .ginfo, .gcinfo, .gcstatus',
    '├ Groupe : .setdesc, .setname, .poll',
    '├ Demandes : .requests, .acceptall, .rejectall',
    '├ Modération : .del (message du bot seulement)',
    '├ Propriétaire : .out, .leave',
    '╰───────────────────⊷',
    'Les commandes .newgc, .join, .invite, .gcpp, .chreact et les fonctions non listées ne sont pas activées dans ce pack.',
  ].join('\n'));
});


const MHE_OWNER_GOLD_ALIASES = [
  'mhe-owner', 'prefix', 'botname', 'ownername', 'ownernumber', 'description', 'stickername',
  'sudo', 'addsudo', 'delsudo', 'listsudo', 'ban', 'unban', 'banlist',
  'welcome', 'goodbye', 'setwelcome', 'setgoodbye',
  'antilink', 'antidelete', 'antitag', 'antistatusmention', 'antiedit', 'anticall',
  'autoread', 'autotype', 'autotyping', 'autoreact', 'recording', 'online',
  'statusview', 'statuslike', 'adminaction', 'settings', 'set', 'update',
];
function requireOwner(isOwner) {
  if (!isOwner) throw new Error('Réservé au propriétaire du bot.');
}
function normalizeUserNumber(value = '') {
  return value.replace(/[^0-9]/g, '');
}
for (const alias of ['prefix', 'botname', 'ownername']) {
  register(alias, 'PROPRIÉTAIRE', 'Modifier la configuration du bot', async ({ chat, args, isOwner }) => {
    requireOwner(isOwner);
    const value = args.join(' ').trim();
    if (!value) throw new Error(`Utilise ${PREFIX}${alias} valeur`);
    if (alias === 'prefix') {
      if (value.length > 3 || /\\s/.test(value)) throw new Error('Le préfixe doit faire entre 1 et 3 caractères, sans espace.');
      PREFIX = value; settings.prefix = value;
    } else if (alias === 'botname') {
      BOT_NAME = value; settings.botname = value;
    } else {
      DISPLAY_OWNER = value; settings.ownername = value;
    }
    await saveSettings();
    await sendText(chat, `✅ ${alias} mis à jour : ${value}`);
  }, true);
}
register('ownernumber', 'PROPRIÉTAIRE', 'Afficher la configuration des numéros propriétaires', async ({ chat, isOwner }) => {
  requireOwner(isOwner);
  await sendText(chat, `OWNER_NUMBERS configurés : ${OWNER_NUMBERS.size ? [...OWNER_NUMBERS].join(', ') : 'aucun via variable d’environnement'}. Le compte WhatsApp connecté est aussi reconnu comme propriétaire.`);
}, true);
for (const alias of ['sudo', 'addsudo']) {
  register(alias, 'PROPRIÉTAIRE', 'Ajouter un numéro SUDO', async ({ chat, args, isOwner }) => {
    requireOwner(isOwner);
    const number = normalizeUserNumber(args[0] || '');
    if (number.length < 7 || number.length > 15) throw new Error(`Utilise ${PREFIX}${alias} numéro_international`);
    settings.sudo ||= [];
    if (!settings.sudo.includes(number)) settings.sudo.push(number);
    await saveSettings();
    await sendText(chat, `✅ SUDO ajouté : ${number}`);
  }, true);
}
register('delsudo', 'PROPRIÉTAIRE', 'Retirer un numéro SUDO', async ({ chat, args, isOwner }) => {
  requireOwner(isOwner);
  const number = normalizeUserNumber(args[0] || '');
  settings.sudo = (settings.sudo || []).filter((item) => item !== number);
  await saveSettings();
  await sendText(chat, `✅ SUDO retiré : ${number || 'numéro manquant'}`);
}, true);
register('listsudo', 'PROPRIÉTAIRE', 'Lister les numéros SUDO', async ({ chat, isOwner }) => {
  requireOwner(isOwner);
  await sendText(chat, (settings.sudo || []).length ? `SUDO :\n${settings.sudo.join('\n')}` : 'Aucun SUDO configuré.');
}, true);
register('ban', 'PROPRIÉTAIRE', 'Bloquer un utilisateur du bot', async ({ chat, message, args, isOwner }) => {
  requireOwner(isOwner);
  const mentioned = targetJids(message)[0];
  const number = normalizeUserNumber(mentioned || args[0] || '');
  if (number.length < 7 || number.length > 15) throw new Error(`Mentionne un utilisateur ou utilise ${PREFIX}ban numéro`);
  const jid = mentioned || `${number}@s.whatsapp.net`;
  settings.banned ||= [];
  if (!settings.banned.includes(jid)) settings.banned.push(jid);
  await saveSettings();
  await sendText(chat, `⛔ Utilisateur bloqué pour les commandes du bot : ${jid}`);
}, true);
register('unban', 'PROPRIÉTAIRE', 'Débloquer un utilisateur du bot', async ({ chat, message, args, isOwner }) => {
  requireOwner(isOwner);
  const mentioned = targetJids(message)[0];
  const raw = mentioned || args[0] || '';
  const number = normalizeUserNumber(raw);
  if (!number) throw new Error(`Utilise ${PREFIX}unban numéro ou mention`);
  settings.banned = (settings.banned || []).filter((item) => normalizeUserNumber(item) !== number);
  await saveSettings();
  await sendText(chat, `✅ Utilisateur débloqué : ${number}`);
}, true);
register('banlist', 'PROPRIÉTAIRE', 'Afficher les utilisateurs bloqués', async ({ chat, isOwner }) => {
  requireOwner(isOwner);
  const list = settings.banned || [];
  await sendText(chat, list.length ? `Utilisateurs bloqués : ${list.length}\n${list.join('\n')}` : 'Aucun utilisateur bloqué.');
}, true);
for (const alias of ['welcome', 'goodbye']) {
  register(alias, 'PROPRIÉTAIRE', 'Activer ou désactiver les messages de bienvenue/départ', async ({ chat, args, isOwner }) => {
    requireOwner(isOwner);
    const state = (args[0] || '').toLowerCase();
    if (!['on', 'off'].includes(state)) throw new Error(`Utilise ${PREFIX}${alias} on ou off`);
    settings[alias] = state === 'on';
    await saveSettings();
    await sendText(chat, `✅ ${alias} : ${state.toUpperCase()}. Note : l’envoi automatique dépend du gestionnaire d’événements de groupe.`);
  }, true);
}
for (const alias of ['setwelcome', 'setgoodbye']) {
  register(alias, 'PROPRIÉTAIRE', 'Enregistrer le texte de bienvenue/départ', async ({ chat, args, isOwner }) => {
    requireOwner(isOwner);
    const value = args.join(' ').trim();
    if (!value) throw new Error(`Utilise ${PREFIX}${alias} ton message`);
    settings[alias] = value;
    await saveSettings();
    await sendText(chat, `✅ Texte ${alias} enregistré.`);
  }, true);
}
for (const alias of ['antilink','antispam','antidelete','antitag','antistatusmention','antiedit','anticall','autoread','autotype','autotyping','autoreact','recording','online','statusview','statuslike','adminaction']) {
  register(alias, 'PROPRIÉTAIRE', 'Modifier un réglage du bot', async ({ chat, args, isOwner }) => {
    requireOwner(isOwner);
    const state = (args[0] || '').toLowerCase();
    if (!['on', 'off'].includes(state)) throw new Error(`Utilise ${PREFIX}${alias} on ou off`);
    settings[alias] = state === 'on';
    await saveSettings();
    await sendText(chat, `✅ ${alias.toUpperCase()} : ${state.toUpperCase()}. Attention : ce réglage est enregistré; son effet dépend de son intégration dans le gestionnaire WhatsApp.`);
  }, true);
}
register('settings', 'PROPRIÉTAIRE', 'Afficher les réglages enregistrés', async ({ chat, isOwner }) => {
  requireOwner(isOwner);
  const safe = { ...settings, sudo: settings.sudo || [], banned: settings.banned || [] };
  await sendText(chat, `╭┈───〔 M.H.E OWNER GOLD 〕┈───⊷\nMode : ${mode}\nPréfixe : ${PREFIX}\nBot : ${BOT_NAME}\nPropriétaire affiché : ${DISPLAY_OWNER}\nSUDO : ${safe.sudo.length}\nBannis : ${safe.banned.length}\nBienvenue : ${safe.welcome ? 'ON' : 'OFF'}\nAu revoir : ${safe.goodbye ? 'ON' : 'OFF'}\nAntilink : ${safe.antilink ? 'ON' : 'OFF'}\n╰───────────────────⊷`);
}, true);
register('mhe-owner', 'PROPRIÉTAIRE', 'Afficher l’aide OWNER GOLD', async ({ chat, isOwner }) => {
  requireOwner(isOwner);
  await sendText(chat, [
    '╭┈───〔 M.H.E OWNER GOLD 〕┈───⊷',
    '├ .mode public/private',
    '├ .prefix !',
    '├ .botname M.H.E-MD',
    '├ .ownername HORDAIN MADILA',
    '├ .sudo numéro / .delsudo numéro / .listsudo',
    '├ .ban numéro / .unban numéro / .banlist',
    '├ .welcome on/off / .goodbye on/off',
    '├ .setwelcome texte / .setgoodbye texte',
    '├ .antilink on/off / .autoread on/off / .autoreact on/off',
    '├ .settings',
    '╰───────────────────⊷',
    'Les réglages sans intégration dans le gestionnaire ne changent pas encore automatiquement le comportement du bot.',
  ].join('\n'));
}, true);

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


const MHE_DOWNLOAD_ALIASES = [
  'download', 'play', 'video', 'song', 'ytmp3', 'ytmp4',
  'tiktok', 'tiktok2', 'tiktok3', 'tt', 'fb', 'facebook',
  'ig', 'igdl', 'igdl2', 'igdl3', 'instagram', 'apk', 'modapk',
  'mediafire', 'mega', 'gdrive', 'gdrivedl', 'pinterest',
  'pinterestimg', 'twitter', 'capcut', 'tiktoksearch',
];
function identifyDownloadTarget(input) {
  let parsed;
  try { parsed = new URL(input); } catch { return null; }
  if (!['http:', 'https:'].includes(parsed.protocol)) return null;
  const host = parsed.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host === '127.0.0.1' || host === '::1'
    || /^10\\./.test(host) || /^192\\.168\\./.test(host) || /^172\\.(1[6-9]|2\\d|3[01])\\./.test(host)) return null;
  if (/youtube\\.com$|youtu\\.be$/.test(host)) return 'YouTube';
  if (/tiktok\\.com$/.test(host)) return 'TikTok';
  if (/facebook\\.com$|fb\\.watch$/.test(host)) return 'Facebook';
  if (/instagram\\.com$/.test(host)) return 'Instagram';
  if (/twitter\\.com$|x\\.com$/.test(host)) return 'X / Twitter';
  if (/mediafire\\.com$/.test(host)) return 'MediaFire';
  if (/drive\\.google\\.com$/.test(host)) return 'Google Drive';
  if (/mega\\.nz$/.test(host)) return 'MEGA';
  if (/pinterest\\.com$/.test(host)) return 'Pinterest';
  if (/capcut\\.com$/.test(host)) return 'CapCut';
  return 'Lien direct';
}
function isDirectDownloadUrl(input) {
  try {
    const parsed = new URL(input);
    return /\\.(mp3|m4a|ogg|wav|mp4|webm|mov|jpg|jpeg|png|webp|gif|pdf|zip|apk)$/i.test(parsed.pathname);
  } catch { return false; }
}
for (const alias of MHE_DOWNLOAD_ALIASES) {
  register(alias, 'TÉLÉCHARGEMENT', 'Détecter la plateforme ou traiter un lien direct', async ({ chat, args }) => {
    const input = args.join(' ').trim();
    if (!input) {
      await sendText(chat,
        '╭┈───〔 M.H.E DOWNLOAD 〕┈───⊷\\n' +
        '├ .download <lien> — détecter une plateforme\\n' +
        '├ .play <recherche> — nécessite un fournisseur YouTube configuré\\n' +
        '├ .video <recherche> — nécessite un fournisseur YouTube configuré\\n' +
        '╰───────────────────⊷\\n\\n' +
        'Les téléchargements sociaux nécessitent une API réelle configurée. Les alias sont enregistrés, mais cela ne signifie pas que chaque plateforme est déjà prise en charge.'
      );
      return;
    }
    const platform = identifyDownloadTarget(input);
    if (!platform) throw new Error('Lien HTTP/HTTPS invalide ou adresse locale refusée.');
    if (platform === 'Lien direct' && isDirectDownloadUrl(input)) {
      const ext = new URL(input).pathname.split('.').pop()?.toLowerCase() || 'bin';
      const mimeByExt = {
        mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg', wav: 'audio/wav',
        mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
        jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
        gif: 'image/gif', pdf: 'application/pdf', zip: 'application/zip',
        apk: 'application/vnd.android.package-archive',
      };
      await sendText(chat, '⬇️ Lien direct détecté. Je transmets le fichier si WhatsApp peut le récupérer depuis cette URL.');
      await socket.sendMessage(chat, {
        document: { url: input },
        mimetype: mimeByExt[ext] || 'application/octet-stream',
        fileName: decodeURIComponent(new URL(input).pathname.split('/').pop() || `download.${ext}`),
        caption: 'M.H.E-MD — lien direct',
      });
      return;
    }
    throw new Error(
      `${platform} détecté, mais aucun fournisseur de téléchargement fiable n'est configuré pour cette plateforme. Aucun faux lien API n'a été ajouté. Configure une API documentée avant d'activer ce téléchargement.`
    );
  });
}


const MHE_TOOLS_ALIASES = [
  'mhe-tools', 'remini', 'enhance', 'upscale', 'hd',
  'removebg', 'removebg2', 'removebg3', 'nobg',
  'blur', 'unblur', 'deblur',
  'happy', 'heart', 'angry', 'sad', 'shy', 'moon', 'confused', 'hot', 'nikal',
  'fancy', 'flag', 'boost', 'hashtag', 'ssweb', 'tourl', 'toimg',
];
const MHE_IMAGE_TOOL_COMMANDS = new Set([
  'remini', 'enhance', 'upscale', 'hd', 'removebg', 'removebg2',
  'removebg3', 'nobg', 'blur', 'unblur', 'deblur', 'happy',
  'heart', 'angry', 'sad', 'shy', 'moon', 'confused', 'hot', 'nikal',
  'tourl', 'toimg',
]);
function makeFancyText(value) {
  const maps = [
    [0x1d5d4, 0x1d5ee, 0x1d608],
    [0x1d5a0, 0x1d5ba, 0x1d5d4],
    [0x1d670, 0x1d68a, 0x1d6a4],
  ];
  const convert = (text, baseUpper, baseLower) => [...text].map((ch) => {
    const code = ch.codePointAt(0);
    if (code >= 65 && code <= 90) return String.fromCodePoint(baseUpper + code - 65);
    if (code >= 97 && code <= 122) return String.fromCodePoint(baseLower + code - 97);
    return ch;
  }).join('');
  return [
    convert(value, maps[0][0], maps[0][1]),
    convert(value, maps[1][0], maps[1][1]),
    convert(value, maps[2][0], maps[2][1]),
    value.toUpperCase(),
    value.toLowerCase(),
    [...value].reverse().join(''),
  ];
}
function countryCodeToFlag(value) {
  const code = value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return null;
  return String.fromCodePoint(...[...code].map((letter) => 127397 + letter.charCodeAt(0)));
}
for (const alias of MHE_TOOLS_ALIASES) {
  register(alias, 'TOOLS GOLD', 'Outils texte et images', async ({ chat, args, message }) => {
    const value = args.join(' ').trim();
    if (alias === 'fancy') {
      if (!value) throw new Error(`Utilise ${PREFIX}fancy Bonjour pour obtenir six styles de texte.`);
      const styles = makeFancyText(value);
      await sendText(chat, `╭┈───〔 M.H.E FANCY 〕┈───⊷\n${styles.join('\n')}\n╰───────────────────⊷`);
      return;
    }
    if (alias === 'flag') {
      const flag = countryCodeToFlag(value);
      if (!flag) throw new Error(`Utilise un code pays à deux lettres, par exemple ${PREFIX}flag CG.`);
      await sendText(chat, `Drapeau correspondant au code ${value.toUpperCase()} : ${flag}\nNote : l'affichage dépend de l'appareil.`);
      return;
    }
    if (alias === 'hashtag') {
      if (!value) throw new Error(`Utilise ${PREFIX}hashtag un sujet`);
      const tags = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
        .split(/[^\p{L}\p{N}_]+/u).filter(Boolean).slice(0, 20)
        .map((word) => `#${word}`);
      await sendText(chat, tags.join(' '));
      return;
    }
    if (alias === 'boost') {
      if (!value) throw new Error(`Utilise ${PREFIX}boost ton texte`);
      await sendText(chat, `✨ ${value} ✨\n\n— M.H.E-MD`);
      return;
    }
    if (alias === 'ssweb') {
      if (!value) throw new Error(`Utilise ${PREFIX}ssweb https://example.com`);
      let parsed;
      try { parsed = new URL(value.startsWith('http://') || value.startsWith('https://') ? value : `https://${value}`); }
      catch { throw new Error('URL invalide.'); }
      if (!['http:', 'https:'].includes(parsed.protocol)
        || ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)
        || parsed.hostname.endsWith('.localhost')
        || /^10\./.test(parsed.hostname) || /^192\.168\./.test(parsed.hostname)
        || /^172\.(1[6-9]|2\d|3[01])\./.test(parsed.hostname)) {
        throw new Error('Cette URL n’est pas autorisée.');
      }
      throw new Error('La capture d’écran nécessite un fournisseur de capture configuré. Aucun service fictif n’a été ajouté.');
    }
    if (MHE_IMAGE_TOOL_COMMANDS.has(alias)) {
      const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      const hasImage = Boolean(message.message?.imageMessage || quoted?.imageMessage);
      if (!hasImage) throw new Error(`Réponds à une image avec ${PREFIX}${alias}.`);
      throw new Error('Le traitement image n’est pas encore activé : il faut connecter et tester un fournisseur réel avant de modifier ou d’héberger l’image.');
    }
    if (alias === 'mhe-tools') {
      await sendText(chat,
        '╭┈───〔 M.H.E TOOLS GOLD 〕┈───⊷\n' +
        '├ Texte : .fancy, .hashtag, .boost\n' +
        '├ Drapeau : .flag CG\n' +
        '├ Capture : .ssweb https://example.com (fournisseur requis)\n' +
        '├ Images : .remini, .removebg, .blur, .unblur (fournisseur requis)\n' +
        '╰───────────────────⊷\n' +
        'Les alias sont enregistrés, mais les traitements d’image ne sont pas annoncés comme actifs tant qu’un service réel n’est pas configuré.'
      );
      return;
    }
  });
}

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
    browser: ['Ubuntu', 'Chrome', '1.0.0'],
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
        // WhatsApp invalidated this login. Reset only this bot's auth files
        // so the pairing page can create a fresh login.
        logger.warn('WhatsApp session logged out; clearing invalid auth files to allow a new pairing.');
        (async () => {
          try {
            // SESSION_DIR may be a mounted Railway volume root; never remove
            // the mount point itself (EBUSY). Clear only its contents.
            await fs.mkdir(SESSION_DIR, { recursive: true });
            const entries = await fs.readdir(SESSION_DIR);
            await Promise.all(entries.map((entry) =>
              fs.rm(path.join(SESSION_DIR, entry), { recursive: true, force: true })
            ));
            authState = undefined;
            saveCreds = undefined;
            reconnectTimer = setTimeout(() => startWhatsApp().catch((err) => logger.error({ err }, 'WhatsApp restart after logout failed')), 1500);
          } catch (err) {
            logger.error({ err }, 'Could not reset logged-out WhatsApp auth state');
          }
        })();
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
      const actor = senderJid(message);
      const actorNumber = cleanNumber(actor);
      const blocked = (settings.banned || []).some((item) => cleanNumber(item) === actorNumber);
      if (blocked && !message.key.fromMe) continue;
      if (message.key.remoteJid?.endsWith('@g.us') && !message.key.fromMe) {
        const groupJid = message.key.remoteJid;
        const group = getGroupSettings(groupJid);
        group.activity ||= {};
        group.activityNames ||= {};
        group.activity[actor] = (group.activity[actor] || 0) + 1;
        if (message.pushName) group.activityNames[actor] = message.pushName;
        const recent = recentGroupMessages.get(groupJid) || [];
        recent.push(message.key);
        if (recent.length > 1000) recent.splice(0, recent.length - 1000);
        recentGroupMessages.set(groupJid, recent);
        activitySinceSave += 1;
        if (activitySinceSave >= 10) {
          activitySinceSave = 0;
          saveSettings().catch((error) => logger.warn({ err: error }, 'Could not persist group activity'));
        }
      }
      if (await handleMheGoldIncoming(message, { mode })) continue;
      if (!text.startsWith(PREFIX)) continue;
      const [name, ...args] = text.slice(PREFIX.length).trim().split(/\s+/);
      if (!name) continue;
      const connectedOwnerNumber = cleanNumber(socket?.user?.id || '');
      const isOwner = Boolean(message.key.fromMe)
        || (connectedOwnerNumber && actorNumber === connectedOwnerNumber)
        || OWNER_NUMBERS.has(actorNumber);
      await executeCommand(message, name.toLowerCase(), args, isOwner);
    }
  });
}

await loadSettings();
const handleMheGoldIncoming = registerMheGoldV2({
  register,
  sendText,
  settings,
  saveSettings,
  getSocket: () => socket,
  getPrefix: () => PREFIX,
});
await startWhatsApp().catch((error) => logger.error({ err: error }, 'WhatsApp startup failed'));
process.on('SIGTERM', async () => {
  server.close();
  try { socket?.end(undefined); } catch {}
  process.exit(0);
});