import { randomBytes } from 'node:crypto';
import { referralDb, referralStorageConfigured, requireMethod, sendJson } from '../../lib/vercel-referrals.js';

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) return;
  if (!referralStorageConfigured()) {
    return sendJson(res, 503, { error: 'Le suivi des parrainages n’est pas configuré.' });
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = randomBytes(5).toString('hex').toUpperCase();
    try {
      const rows = await referralDb('mhe_referrals', {
        method: 'POST',
        body: JSON.stringify({ code }),
      });
      if (!Array.isArray(rows) || !rows[0]?.code) throw new Error('Unexpected Supabase response.');
      return sendJson(res, 201, { code: rows[0].code, url: `/r/${rows[0].code}` });
    } catch (error) {
      if (error.status === 409 && attempt < 2) continue;
      console.error('[MHE REFERRALS] Code creation failed:', error.message);
      return sendJson(res, 503, { error: 'Impossible de créer un lien pour le moment. Réessaie plus tard.' });
    }
  }

  return sendJson(res, 503, { error: 'Service temporairement indisponible.' });
}
