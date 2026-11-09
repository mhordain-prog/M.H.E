import path from 'node:path';
import { timingSafeEqual } from 'node:crypto';

function authorized(req) {
  const expected = process.env.CONTROL_PANEL_TOKEN;
  if (!expected || expected.length < 24) return false;
  const supplied = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createControlSnapshot({ commands, socket, mode, prefix, ownerName, startedAt }) {
  const categories = new Map();
  for (const command of commands.values()) {
    const category = command.category || 'OTHER';
    categories.set(category, (categories.get(category) || 0) + 1);
  }
  const memory = process.memoryUsage();
  return {
    app: 'M.H.E-MD GOLD', status: socket?.user ? 'connected' : 'waiting',
    mode: String(mode || 'private').toUpperCase(), prefix: prefix || '.',
    owner: ownerName || 'HORDAIN MADILA',
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    commandCount: commands.size,
    categories: [...categories.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, count]) => ({ name, count })),
    commands: [...commands.values()].map(({ name, category, description, ownerOnly }) => ({ name, category: category || 'OTHER', description: description || 'No description', ownerOnly: Boolean(ownerOnly) })).sort((a, b) => a.name.localeCompare(b.name)),
    runtime: { node: process.version, platform: process.platform, architecture: process.arch, memoryRssMb: Math.round(memory.rss / 1048576), heapUsedMb: Math.round(memory.heapUsed / 1048576), heapTotalMb: Math.round(memory.heapTotal / 1048576) },
    updatedAt: new Date().toISOString(),
  };
}

export function registerControlCenter({ app, commands, getSocket, getMode, getPrefix, getOwnerName, getStartedAt }) {
  app.get('/control', (_req, res) => res.sendFile(path.resolve('control.html')));
  app.get('/api/control/status', (req, res) => {
    if (!process.env.CONTROL_PANEL_TOKEN || process.env.CONTROL_PANEL_TOKEN.length < 24) {
      return res.status(503).json({ error: 'Control Center non configuré. Ajoute CONTROL_PANEL_TOKEN (au moins 24 caractères) dans les variables secrètes de Render.' });
    }
    if (!authorized(req)) return res.status(401).json({ error: 'Accès refusé. Saisis le mot de passe du Control Center.' });
    return res.json(createControlSnapshot({ commands, socket: getSocket(), mode: getMode(), prefix: getPrefix(), ownerName: getOwnerName(), startedAt: getStartedAt() }));
  });
}
