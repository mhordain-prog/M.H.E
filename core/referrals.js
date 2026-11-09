import path from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';

function configured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
function adminAuthorized(req) {
  const expected = process.env.CONTROL_PANEL_TOKEN || '';
  const supplied = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (expected.length < 24) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}
async function db(pathname, options = {}) {
  const base = process.env.SUPABASE_URL.replace(/\/$/, '');
  const response = await fetch(`${base}/rest/v1/${pathname}`, {
    ...options,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: options.prefer || 'return=representation',
      ...options.headers,
    },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Supabase referral request failed (${response.status}): ${body.slice(0, 300)}`);
  return body ? JSON.parse(body) : null;
}

export function registerReferrals({ app }) {
  app.get('/parrainage', (_req, res) => res.sendFile(path.resolve('parrainage.html')));

  app.get('/r/:code', async (req, res) => {
    const code = String(req.params.code || '').toUpperCase();
    if (!/^[A-F0-9]{10}$/.test(code)) return res.redirect('/parrainage?invalid=1');
    if (!configured()) return res.redirect('/parrainage?setup=1');
    try {
      await db('rpc/mhe_record_referral_visit', {
        method: 'POST',
        body: JSON.stringify({ p_code: code }),
        prefer: 'return=minimal',
      });
    } catch (error) {
      console.warn('[MHE REFERRALS] Visit not recorded:', error.message);
    }
    return res.redirect(302, `/parrainage?ref=${code}`);
  });

  app.post('/api/referrals/create', async (_req, res) => {
    if (!configured()) return res.status(503).json({ error: 'Le suivi des parrainages n’est pas configuré. Consulte le guide Supabase du dépôt M.H.E.' });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const code = randomBytes(5).toString('hex').toUpperCase();
      try {
        const rows = await db('mhe_referrals', {
          method: 'POST',
          body: JSON.stringify({ code }),
        });
        return res.status(201).json({ code: rows[0].code, url: `${req.protocol}://${req.get('host')}/r/${rows[0].code}` });
      } catch (error) {
        if (attempt === 2) {
          console.error('[MHE REFERRALS] Code creation failed:', error.message);
          return res.status(503).json({ error: 'Impossible de créer un lien pour le moment. Réessaie plus tard.' });
        }
      }
    }
    return res.status(503).json({ error: 'Service temporairement indisponible.' });
  });

  app.get('/api/referrals/:code', async (req, res) => {
    if (!configured()) return res.status(503).json({ error: 'Le suivi des parrainages n’est pas configuré.' });
    const code = String(req.params.code || '').toUpperCase();
    if (!/^[A-F0-9]{10}$/.test(code)) return res.status(400).json({ error: 'Code invalide.' });
    try {
      const rows = await db(`mhe_referrals?code=eq.${code}&select=code,visits,validated_referrals,created_at`);
      if (!rows.length) return res.status(404).json({ error: 'Ce code de parrainage est introuvable.' });
      return res.set('Cache-Control', 'no-store').json(rows[0]);
    } catch (error) {
      console.error('[MHE REFERRALS] Read failed:', error.message);
      return res.status(503).json({ error: 'Impossible de charger les statistiques.' });
    }
  });

  app.post('/api/referrals/:code/validate', async (req, res) => {
    if (!adminAuthorized(req)) return res.status(401).json({ error: 'Accès administrateur refusé.' });
    if (!configured()) return res.status(503).json({ error: 'Stockage des parrainages non configuré.' });
    const code = String(req.params.code || '').toUpperCase();
    const count = Number(req.body?.validatedReferrals);
    if (!/^[A-F0-9]{10}$/.test(code) || !Number.isSafeInteger(count) || count < 0 || count > 1000000) {
      return res.status(400).json({ error: 'Code ou nombre de parrainages validés invalide.' });
    }
    try {
      const rows = await db(`mhe_referrals?code=eq.${code}`, {
        method: 'PATCH',
        body: JSON.stringify({ validated_referrals: count }),
      });
      if (!rows.length) return res.status(404).json({ error: 'Code introuvable.' });
      return res.json(rows[0]);
    } catch (error) {
      console.error('[MHE REFERRALS] Validation update failed:', error.message);
      return res.status(503).json({ error: 'Mise à jour impossible.' });
    }
  });
}
