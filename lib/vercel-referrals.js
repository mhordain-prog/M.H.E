import { timingSafeEqual } from 'node:crypto';

export const REFERRAL_CODE = /^[A-F0-9]{10}$/;

export function referralStorageConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function validReferralCode(value) {
  return REFERRAL_CODE.test(String(value || '').toUpperCase());
}

export function sendJson(res, status, payload) {
  return res.status(status).json(payload);
}

export function redirect(res, location) {
  res.setHeader('Location', location);
  return res.status(302).end();
}

export function requireMethod(req, res, method) {
  if (req.method === method) return true;
  res.setHeader('Allow', method);
  sendJson(res, 405, { error: 'Méthode non autorisée.' });
  return false;
}

export function adminAuthorized(req) {
  const expected = process.env.CONTROL_PANEL_TOKEN || '';
  const supplied = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '');
  if (expected.length < 24) return false;
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

export async function referralDb(path, options = {}) {
  const base = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  if (!base.startsWith('https://')) throw new Error('Supabase URL must use HTTPS.');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const response = await fetch(`${base}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: options.prefer || 'return=representation',
      ...options.headers,
    },
  });
  const body = await response.text();
  if (!response.ok) {
    const error = new Error(`Supabase referral request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return body ? JSON.parse(body) : null;
}
