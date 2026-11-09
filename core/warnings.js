import fs from 'node:fs/promises';
import path from 'node:path';

const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const LIMIT = 3;
const messageWindows = new Map();

export function createWarningManager({ file = './data/warnings.json', sendText, getSocket, getGroupSettings, isOwnerNumber }) {
  let records = {};
  let loaded = false;
  let writeQueue = Promise.resolve();

  async function load() {
    if (loaded) return;
    loaded = true;
    try {
      records = JSON.parse(await fs.readFile(file, 'utf8'));
      if (!records || typeof records !== 'object' || Array.isArray(records)) records = {};
    } catch (error) {
      if (error.code !== 'ENOENT') console.warn('[MHE WARNINGS] Lecture impossible:', error.message);
      records = {};
    }
  }

  function persist() {
    writeQueue = writeQueue.then(async () => {
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, JSON.stringify(records, null, 2));
    }).catch((error) => console.warn('[MHE WARNINGS] Sauvegarde impossible:', error.message));
    return writeQueue;
  }

  function clean(jid = '') {
    return jid.split('@')[0].split(':')[0].replace(/\D/g, '');
  }

  async function isPrivileged(groupJid, actorJid) {
    if (isOwnerNumber?.(clean(actorJid))) return true;
    try {
      const sock = getSocket();
      if (!sock) return false;
      const metadata = await sock.groupMetadata(groupJid);
      const participant = (metadata.participants || []).find((item) => clean(item.id) === clean(actorJid));
      return Boolean(participant?.admin || participant?.isAdmin || participant?.isSuperAdmin);
    } catch {
      return false;
    }
  }

  async function warn({ groupJid, actorJid, reason, messageKey }) {
    await load();
    if (!groupJid?.endsWith('@g.us') || !actorJid || await isPrivileged(groupJid, actorJid)) return { skipped: true };
    const now = Date.now();
    const key = groupJid + '|' + clean(actorJid);
    const existing = Array.isArray(records[key]) ? records[key] : [];
    const active = existing.filter((entry) => Number(entry.at) > now - WINDOW_MS);
    active.push({ at: now, reason: String(reason || 'Règle du groupe').slice(0, 100) });
    records[key] = active;
    await persist();
    const count = Math.min(active.length, LIMIT);
    const mention = '@' + clean(actorJid);
    const final = count >= LIMIT;
    const text = [
      '🚫 *AVERTISSEMENT M.H.E-MD GOLD*',
      '',
      '👤 Membre : ' + mention,
      '⚠️ Avertissement : ' + count + '/' + LIMIT,
      '📌 Motif : ' + String(reason || 'Règle du groupe').slice(0, 100),
      '⏳ Expiration : 30 jours après chaque avertissement',
      final ? '🛑 Avertissement final : respecte les règles du groupe.' : '🔒 Merci de respecter les règles du groupe.',
    ].join('\n');
    await sendText(groupJid, text, { mentions: [actorJid] });
    return { count, final };
  }

  async function getWarnings(groupJid, actorJid) {
    await load();
    const now = Date.now();
    const key = groupJid + '|' + clean(actorJid);
    const active = (Array.isArray(records[key]) ? records[key] : []).filter((entry) => Number(entry.at) > now - WINDOW_MS);
    if (active.length !== (records[key] || []).length) {
      records[key] = active;
      await persist();
    }
    return active;
  }

  async function resetWarnings(groupJid, actorJid) {
    await load();
    delete records[groupJid + '|' + clean(actorJid)];
    await persist();
  }

  function detectSpam(groupJid, actorJid) {
    const now = Date.now();
    const key = groupJid + '|' + clean(actorJid);
    const recent = (messageWindows.get(key) || []).filter((timestamp) => now - timestamp < 8000);
    recent.push(now);
    messageWindows.set(key, recent);
    if (messageWindows.size > 5000) {
      for (const [entryKey, timestamps] of messageWindows) {
        if (!timestamps.length || now - timestamps[timestamps.length - 1] > 60_000) messageWindows.delete(entryKey);
      }
    }
    return recent.length === 6;
  }

  return { warn, getWarnings, resetWarnings, detectSpam };
}
