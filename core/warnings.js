import fs from 'node:fs/promises';
import path from 'node:path';
import { createSessionScopedMap, getSessionContext } from './session-context.js';

const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const LIMIT = 3;
const SPAM_WINDOW_MS = 8_000;
const SPAM_THRESHOLD = 6;
const MAX_TRACKED_SENDERS = 10_000;
const messageWindows = createSessionScopedMap();
let lastSpamSweep = 0;

function normalizeJid(jid = '') {
  return String(jid).trim().toLowerCase().replace(/:\d+(?=@)/, '');
}

function numbersFrom(values) {
  return values.filter(Boolean).map((value) => String(value).split('@')[0].split(':')[0].replace(/\D/g, '')).filter(Boolean);
}

function warningKey(groupJid, actorJid) {
  const legacyCompatibleId = numbersFrom([actorJid])[0] || normalizeJid(actorJid);
  const sessionId = getSessionContext()?.id || 'primary';
  const scope = sessionId === 'primary' ? '' : `${sessionId}|`;
  return `${scope}${groupJid}|${legacyCompatibleId}`;
}

export function createWarningManager({ file = './data/warnings.json', sendText, getSocket, isOwnerNumber }) {
  let records = {};
  let loaded = false;
  let loadPromise;
  let writeQueue = Promise.resolve();
  let writeSequence = 0;

  async function load() {
    if (loaded) return;
    if (!loadPromise) {
      loadPromise = (async () => {
        try {
          const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
          records = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        } catch (error) {
          if (error.code !== 'ENOENT') console.warn('[MHE WARNINGS] Lecture impossible:', error.message);
          records = {};
        } finally {
          loaded = true;
        }
      })();
    }
    await loadPromise;
  }

  function persist() {
    const write = writeQueue.catch(() => {}).then(async () => {
      const directory = path.dirname(file);
      const temporaryFile = `${file}.${process.pid}.${++writeSequence}.tmp`;
      await fs.mkdir(directory, { recursive: true });
      try {
        await fs.writeFile(temporaryFile, JSON.stringify(records, null, 2), { mode: 0o600 });
        await fs.rename(temporaryFile, file);
      } catch (error) {
        await fs.rm(temporaryFile, { force: true }).catch(() => {});
        throw error;
      }
    });
    writeQueue = write;
    return write;
  }

  async function isPrivileged(groupJid, actorJid) {
    if (isOwnerNumber?.(numbersFrom([actorJid])[0] || '')) return true;
    try {
      const socket = getSocket();
      if (!socket) return false;
      const metadata = await socket.groupMetadata(groupJid);
      const candidates = new Set([normalizeJid(actorJid)]);
      const candidateNumbers = new Set(numbersFrom([actorJid]));
      const participant = (metadata.participants || []).find((item) => {
        const ids = [item?.id, item?.jid, item?.lid, item?.phoneNumber].filter(Boolean);
        return ids.some((id) => candidates.has(normalizeJid(id))
          || numbersFrom([id]).some((number) => candidateNumbers.has(number)));
      });
      return Boolean(participant?.admin || participant?.isAdmin || participant?.isSuperAdmin);
    } catch {
      return false;
    }
  }

  async function warn({ groupJid, actorJid, reason }) {
    await load();
    if (!groupJid?.endsWith('@g.us') || !actorJid) return { skipped: true, reason: 'invalid-target' };
    if (await isPrivileged(groupJid, actorJid)) return { skipped: true, reason: 'privileged' };
    const now = Date.now();
    const key = warningKey(groupJid, actorJid);
    const existing = Array.isArray(records[key]) ? records[key] : [];
    const active = existing.filter((entry) => Number(entry.at) > now - WINDOW_MS);
    active.push({ at: now, reason: String(reason || 'Règle du groupe').slice(0, 100) });
    records[key] = active.slice(-LIMIT);
    await persist();
    const count = records[key].length;
    const mention = '@' + numbersFrom([actorJid]).join('');
    const text = [
      '🚫 *AVERTISSEMENT M.H.E-MD GOLD*',
      '',
      '👤 Membre : ' + mention,
      `⚠️ Avertissements actifs : ${count}/${LIMIT}`,
      '📌 Motif : ' + String(reason || 'Règle du groupe').slice(0, 100),
      '⏳ Expiration : 30 jours après chaque avertissement',
      count >= LIMIT ? '🛑 3e avertissement : un administrateur doit examiner la situation.' : '🔒 Merci de respecter les règles du groupe.',
    ].join('\n');
    await sendText(groupJid, text, { mentions: [actorJid] });
    return { count, final: count >= LIMIT };
  }

  async function getWarnings(groupJid, actorJid) {
    await load();
    const key = warningKey(groupJid, actorJid);
    const existing = Array.isArray(records[key]) ? records[key] : [];
    const active = existing.filter((entry) => Number(entry.at) > Date.now() - WINDOW_MS).slice(-LIMIT);
    if (active.length !== existing.length) {
      records[key] = active;
      await persist();
    }
    return active;
  }

  async function resetWarnings(groupJid, actorJid) {
    await load();
    delete records[warningKey(groupJid, actorJid)];
    await persist();
  }

  function detectSpam(groupJid, actorJid) {
    const now = Date.now();
    const key = warningKey(groupJid, actorJid);
    const recent = (messageWindows.get(key) || []).filter((timestamp) => now - timestamp < SPAM_WINDOW_MS);
    recent.push(now);
    // Keep one post-threshold timestamp so later messages in the same burst do not retrigger.
    const boundedRecent = recent.slice(-(SPAM_THRESHOLD + 1));
    messageWindows.delete(key);
    messageWindows.set(key, boundedRecent);

    if (messageWindows.size > MAX_TRACKED_SENDERS) {
      if (now - lastSpamSweep >= 60_000) {
        lastSpamSweep = now;
        for (const [entryKey, timestamps] of messageWindows) {
          if (!timestamps.length || now - timestamps[timestamps.length - 1] >= SPAM_WINDOW_MS) messageWindows.delete(entryKey);
        }
      }
      while (messageWindows.size > MAX_TRACKED_SENDERS) {
        messageWindows.delete(messageWindows.keys().next().value);
      }
    }
    return recent.length === SPAM_THRESHOLD;
  }

  return { warn, getWarnings, resetWarnings, detectSpam };
}
