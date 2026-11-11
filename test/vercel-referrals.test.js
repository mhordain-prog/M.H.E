import test from 'node:test';
import assert from 'node:assert/strict';
import createReferral from '../api/referrals/create.js';
import getReferral from '../api/referrals/[code].js';
import validateReferral from '../api/referrals/[code]/validate.js';
import trackReferralVisit from '../api/r/[code].js';

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    ended: false,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    setHeader(name, value) { this.headers[name] = value; return this; },
    end() { this.ended = true; return this; },
  };
}

function configure(t, { url = 'https://project.supabase.co', key = 'server-secret', token = 'a-private-control-token-over-24-chars' } = {}) {
  const names = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'CONTROL_PANEL_TOKEN'];
  const prior = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  process.env.SUPABASE_URL = url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = key;
  process.env.CONTROL_PANEL_TOKEN = token;
  t.after(() => {
    for (const name of names) {
      if (prior[name] === undefined) delete process.env[name];
      else process.env[name] = prior[name];
    }
  });
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
}

function upstream(status, payload) {
  return { status, ok: status >= 200 && status < 300, text: async () => payload === null ? '' : JSON.stringify(payload) };
}

test('create endpoint stores a code and returns a same-site referral path', async (t) => {
  configure(t);
  let requested;
  globalThis.fetch = async (url, options) => {
    requested = { url, options };
    return upstream(201, [{ code: JSON.parse(options.body).code }]);
  };
  const res = response();
  await createReferral({ method: 'POST', body: {} }, res);
  assert.equal(res.statusCode, 201);
  assert.match(res.body.code, /^[A-F0-9]{10}$/);
  assert.equal(res.body.url, `/r/${res.body.code}`);
  assert.equal(requested.url, 'https://project.supabase.co/rest/v1/mhe_referrals');
  assert.equal(requested.options.headers.Authorization, 'Bearer server-secret');
});

test('statistics endpoint rejects an invalid code without querying Supabase', async (t) => {
  configure(t);
  globalThis.fetch = async () => { throw new Error('should not fetch'); };
  const res = response();
  await getReferral({ method: 'GET', query: { code: 'bad-code' } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'Code invalide.');
});

test('statistics endpoint returns no-store data for a valid code', async (t) => {
  configure(t);
  globalThis.fetch = async () => upstream(200, [{ code: 'ABCDEF1234', visits: 3, validated_referrals: 1 }]);
  const res = response();
  await getReferral({ method: 'GET', query: { code: 'abcdef1234' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.visits, 3);
  assert.equal(res.headers['Cache-Control'], 'no-store');
});

test('manual validation requires the owner token before database access', async (t) => {
  configure(t);
  globalThis.fetch = async () => { throw new Error('should not fetch'); };
  const res = response();
  await validateReferral({ method: 'POST', headers: {}, query: { code: 'ABCDEF1234' }, body: { validatedReferrals: 1 } }, res);
  assert.equal(res.statusCode, 401);
});

test('referral path records a visit and redirects back to the page', async (t) => {
  configure(t);
  let requested;
  globalThis.fetch = async (url, options) => {
    requested = { url, options };
    return upstream(204, null);
  };
  const res = response();
  await trackReferralVisit({ method: 'GET', query: { code: 'abcdef1234' } }, res);
  assert.equal(requested.url, 'https://project.supabase.co/rest/v1/rpc/mhe_record_referral_visit');
  assert.deepEqual(JSON.parse(requested.options.body), { p_code: 'ABCDEF1234' });
  assert.equal(res.statusCode, 302);
  assert.equal(res.headers.Location, '/parrainage?ref=ABCDEF1234');
});

test('unconfigured referral tracking does not expose a server error', async (t) => {
  const priorUrl = process.env.SUPABASE_URL;
  const priorKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  t.after(() => {
    if (priorUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = priorUrl;
    if (priorKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = priorKey;
  });
  const res = response();
  await createReferral({ method: 'POST' }, res);
  assert.equal(res.statusCode, 503);
  assert.match(res.body.error, /pas configuré/);
});

test('manual validation writes only after the owner token is valid', async (t) => {
  configure(t);
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return upstream(200, [{ code: 'ABCDEF1234', validated_referrals: 2 }]);
  };
  const res = response();
  await validateReferral({
    method: 'POST',
    headers: { authorization: 'Bearer a-private-control-token-over-24-chars' },
    query: { code: 'abcdef1234' },
    body: { validatedReferrals: 2 },
  }, res);
  assert.equal(request.url, 'https://project.supabase.co/rest/v1/mhe_referrals?code=eq.ABCDEF1234');
  assert.equal(request.options.method, 'PATCH');
  assert.deepEqual(JSON.parse(request.options.body), { validated_referrals: 2 });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.validated_referrals, 2);
});
