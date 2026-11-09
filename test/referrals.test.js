import test from 'node:test';
import assert from 'node:assert/strict';
import { registerReferrals } from '../core/referrals.js';

test('registers the referral page, redirect and API endpoints', () => {
  const routes = [];
  const app = {
    get: (route, handler) => routes.push({ method: 'GET', route, handler }),
    post: (route, handler) => routes.push({ method: 'POST', route, handler }),
  };
  registerReferrals({ app });
  assert.deepEqual(routes.map(({ method, route }) => method + ' ' + route), [
    'GET /parrainage',
    'GET /r/:code',
    'POST /api/referrals/create',
    'GET /api/referrals/:code',
    'POST /api/referrals/:code/validate',
  ]);
});

test('invalid public referral code redirects without contacting storage', async () => {
  const routes = [];
  const app = { get: (route, handler) => routes.push({ route, handler }), post() {} };
  registerReferrals({ app });
  const route = routes.find((entry) => entry.route === '/r/:code');
  let destination;
  const response = { redirect: (value) => { destination = value; return value; } };
  await route.handler({ params: { code: 'not-valid' } }, response);
  assert.equal(destination, '/parrainage?invalid=1');
});
