import { adminAuthorized, referralDb, referralStorageConfigured, requireMethod, sendJson, validReferralCode } from '../../../lib/vercel-referrals.js';

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) return;
  if (!adminAuthorized(req)) return sendJson(res, 401, { error: 'Accès administrateur refusé.' });
  if (!referralStorageConfigured()) {
    return sendJson(res, 503, { error: 'Stockage des parrainages non configuré.' });
  }

  const code = String(req.query?.code || '').toUpperCase();
  const count = Number(req.body?.validatedReferrals);
  if (!validReferralCode(code) || !Number.isSafeInteger(count) || count < 0 || count > 1000000) {
    return sendJson(res, 400, { error: 'Code ou nombre de parrainages validés invalide.' });
  }

  try {
    const rows = await referralDb(`mhe_referrals?code=eq.${code}`, {
      method: 'PATCH',
      body: JSON.stringify({ validated_referrals: count }),
    });
    if (!Array.isArray(rows) || !rows.length) return sendJson(res, 404, { error: 'Code introuvable.' });
    res.setHeader('Cache-Control', 'no-store');
    return sendJson(res, 200, rows[0]);
  } catch (error) {
    console.error('[MHE REFERRALS] Validation update failed:', error.message);
    return sendJson(res, 503, { error: 'Mise à jour impossible.' });
  }
}
