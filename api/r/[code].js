import { redirect, referralDb, referralStorageConfigured, requireMethod, validReferralCode } from '../../lib/vercel-referrals.js';

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'GET')) return;

  const code = String(req.query?.code || '').toUpperCase();
  if (!validReferralCode(code)) return redirect(res, '/parrainage?invalid=1');
  if (!referralStorageConfigured()) return redirect(res, '/parrainage?setup=1');

  try {
    await referralDb('rpc/mhe_record_referral_visit', {
      method: 'POST',
      body: JSON.stringify({ p_code: code }),
      prefer: 'return=minimal',
    });
  } catch (error) {
    console.warn('[MHE REFERRALS] Visit not recorded:', error.message);
  }
  return redirect(res, `/parrainage?ref=${code}`);
}
