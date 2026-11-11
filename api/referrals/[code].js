import { referralDb, referralStorageConfigured, requireMethod, sendJson, validReferralCode } from '../../lib/vercel-referrals.js';

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'GET')) return;
  if (!referralStorageConfigured()) {
    return sendJson(res, 503, { error: 'Le suivi des parrainages n’est pas configuré.' });
  }

  const code = String(req.query?.code || '').toUpperCase();
  if (!validReferralCode(code)) return sendJson(res, 400, { error: 'Code invalide.' });

  try {
    const rows = await referralDb(`mhe_referrals?code=eq.${code}&select=code,visits,validated_referrals,created_at`);
    if (!Array.isArray(rows) || !rows.length) return sendJson(res, 404, { error: 'Ce code de parrainage est introuvable.' });
    res.setHeader('Cache-Control', 'no-store');
    return sendJson(res, 200, rows[0]);
  } catch (error) {
    console.error('[MHE REFERRALS] Read failed:', error.message);
    return sendJson(res, 503, { error: 'Impossible de charger les statistiques.' });
  }
}
