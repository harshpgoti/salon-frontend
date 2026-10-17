import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'node:http';
import { waitlistClaimUrl } from '../lib/waitlistClaim.mjs';

let server;
let apiBase;
let handler;
const requests = [];
const slug = 'synthetic-salon-1234567890';
const serviceId = '124b2c04-6d0e-48d6-9421-3db8105428c3';
const staffId = '224b2c04-6d0e-48d6-9421-3db8105428c3';
const holdId = '324b2c04-6d0e-48d6-9421-3db8105428c3';
const appointmentId = '424b2c04-6d0e-48d6-9421-3db8105428c3';

before(async () => {
  server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    requests.push({ url: req.url, method: req.method, headers: req.headers, body });
    res.writeHead(200, { 'Content-Type': 'application/json', 'X-Request-ID': 'upstream-id' });
    res.end(JSON.stringify({ safe: true }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  apiBase = `http://127.0.0.1:${server.address().port}`;
  process.env.API_BASE_URL = apiBase;
  handler = (await import('../pages/api/public-booking.js')).default;
});

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  delete process.env.API_BASE_URL;
});

async function call(method, query, body, headers = {}) {
  const result = { headers: {} };
  const res = {
    setHeader(name, value) { result.headers[name.toLowerCase()] = value; },
    status(code) { result.status = code; return this; },
    json(value) { result.body = value; return this; },
    end(value) { result.body = value; return this; },
  };
  await handler({ method, query, body, headers }, res);
  return result;
}

test('public booking operations forward exact allowlisted resources without cookies or token URLs', async () => {
  const holdBody = { service_id: serviceId, staff_id: staffId,
    starts_at: '2026-10-14T10:00:00-04:00', idempotency_key: 'hold-key-001' };
  const hold = await call('POST', { operation: 'hold', slug }, holdBody,
    { cookie: 'salon_staff_session=must-not-forward' });
  assert.equal(hold.status, 200);
  assert.equal(hold.headers['cache-control'], 'no-store');
  assert.equal(hold.headers['referrer-policy'], 'no-referrer');
  assert.equal(hold.headers['x-request-id'], 'upstream-id');
  assert.equal(requests.at(-1).url, `/v1/public/salons/${slug}/holds`);
  assert.equal(requests.at(-1).method, 'POST');
  assert.equal(requests.at(-1).headers.cookie, undefined);
  assert.deepEqual(JSON.parse(requests.at(-1).body), holdBody);

  const confirmBody = { owner_token: 'x'.repeat(32), client_name: 'Synthetic Booker',
    email: 'booker@example.invalid', policy_accepted: true, policy_version: 3,
    idempotency_key: 'confirm-key-001', marketing_opt_in: false,
    attribution_token: 'a'.repeat(32) };
  await call('POST', { operation: 'confirm', slug, hold_id: holdId }, confirmBody);
  assert.equal(requests.at(-1).url, `/v1/public/salons/${slug}/holds/${holdId}/confirm`);
  assert.deepEqual(JSON.parse(requests.at(-1).body), confirmBody);

  const claimToken = 'c'.repeat(48);
  const claimBody = { owner_token: claimToken, idempotency_key: 'claim-offer-001' };
  await call('POST', { operation: 'claim', slug, offer_id: appointmentId }, claimBody,
    { cookie: 'salon_staff_session=must-not-forward', referer: 'https://attacker.invalid/' });
  assert.equal(requests.at(-1).url, `/v1/public/salons/${slug}/offers/${appointmentId}/claim`);
  assert.equal(requests.at(-1).method, 'POST');
  assert.equal(requests.at(-1).headers.cookie, undefined);
  assert.equal(requests.at(-1).url.includes(claimToken), false);
  assert.deepEqual(JSON.parse(requests.at(-1).body), claimBody);

  const token = 'a'.repeat(64);
  await call('POST', { operation: 'manage', slug, appointment_id: appointmentId }, { token });
  assert.equal(requests.at(-1).url, `/v1/public/salons/${slug}/manage/${appointmentId}`);
  assert.equal(requests.at(-1).method, 'GET');
  assert.equal(requests.at(-1).headers.authorization, `Bearer ${token}`);
  assert.equal(requests.at(-1).body, '');
  assert.equal(requests.at(-1).url.includes(token), false);

  const cancel = { token, expected_version: 4, idempotency_key: 'cancel-public-001' };
  await call('POST', { operation: 'manage_cancel', slug, appointment_id: appointmentId }, cancel);
  assert.equal(requests.at(-1).url, `/v1/public/salons/${slug}/manage/${appointmentId}/cancel`);
  assert.equal(requests.at(-1).method, 'POST');
  assert.equal(requests.at(-1).headers.authorization, `Bearer ${token}`);
  assert.deepEqual(JSON.parse(requests.at(-1).body), {
    expected_version: 4, idempotency_key: 'cancel-public-001',
  });
  const reschedule = { token, expected_version: 4, starts_at: '2026-10-20T10:00:00-04:00',
    idempotency_key: 'reschedule-public-1' };
  await call('POST', { operation: 'manage_reschedule', slug, appointment_id: appointmentId }, reschedule);
  assert.equal(requests.at(-1).url, `/v1/public/salons/${slug}/manage/${appointmentId}/reschedule`);
  assert.equal(requests.at(-1).headers.authorization, `Bearer ${token}`);
  assert.deepEqual(JSON.parse(requests.at(-1).body), {
    expected_version: 4, starts_at: reschedule.starts_at, idempotency_key: reschedule.idempotency_key,
  });
});

test('malformed identifiers, extra fields, unsupported operations, and wrong methods stop at the proxy', async () => {
  const seen = requests.length;
  assert.equal((await call('POST', { operation: 'hold', slug: '../tenant' }, {})).status, 400);
  assert.equal((await call('POST', { operation: 'confirm', slug, hold_id: 'bad' }, {})).status, 400);
  assert.equal((await call('POST', { operation: 'claim', slug, offer_id: 'bad' }, {
    owner_token: 'x'.repeat(48), idempotency_key: 'claim-key-001' })).status, 400);
  assert.equal((await call('POST', { operation: 'claim', slug, offer_id: appointmentId }, {
    owner_token: 'x'.repeat(48), idempotency_key: 'claim-key-001', client_id: serviceId })).status, 400);
  assert.equal((await call('POST', { operation: 'manage', slug, appointment_id: appointmentId },
    { token: 'x'.repeat(64), client_id: serviceId })).status, 400);
  assert.equal((await call('POST', { operation: 'manage_cancel', slug, appointment_id: appointmentId },
    { token: 'x'.repeat(64), expected_version: 1, idempotency_key: 'cancel-key-001', reason: 'unlisted' })).status, 400);
  assert.equal((await call('POST', { operation: 'manage_reschedule', slug, appointment_id: appointmentId },
    { token: 'x'.repeat(64), expected_version: 1, idempotency_key: 'move-key-001',
      starts_at: '2026-10-20T10:00:00' })).status, 400);
  assert.equal((await call('POST', { operation: 'hold', slug }, { service_id: serviceId,
    staff_id: staffId, starts_at: 'time', idempotency_key: 'hold-key-002', upstream_path: '/secret' })).status, 400);
  assert.equal((await call('GET', { operation: 'hold', slug })).status, 405);
  assert.equal((await call('POST', { operation: 'unknown', slug }, {})).status, 404);
  assert.equal(requests.length, seen);
});

test('waitlist claim bearer tokens stay in the URL fragment, outside path and query', () => {
  const ownerToken = 't'.repeat(48);
  const link = new URL(waitlistClaimUrl('https://salon.example', slug, appointmentId, ownerToken));
  assert.equal(link.pathname, `/waitlist/claim/${slug}/${appointmentId}`);
  assert.equal(link.search, '');
  assert.equal(new URLSearchParams(link.hash.slice(1)).get('token'), ownerToken);
  assert.equal(link.pathname.includes(ownerToken), false);
  assert.throws(() => waitlistClaimUrl('https://salon.example', slug, 'bad', ownerToken), TypeError);
});
