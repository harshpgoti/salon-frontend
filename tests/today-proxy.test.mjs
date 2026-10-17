import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'node:http';

const tenant = '11111111-1111-4111-8111-111111111111';
const location = '22222222-2222-4222-8222-222222222222';
let server, handler, upstreamStatus = 200, payload = { date: '2026-10-14', appointments: [] };
const requests = [];

before(async () => {
  server = createServer(async (req, res) => {
    for await (const _chunk of req) { /* consume the body */ }
    requests.push({ method: req.method, url: req.url, cookie: req.headers.cookie });
    res.writeHead(upstreamStatus, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  process.env.API_BASE_URL = `http://127.0.0.1:${server.address().port}`;
  handler = (await import('../pages/api/today.js')).default;
});

after(async () => { if (server) await new Promise(resolve => server.close(resolve)); });

async function request(method, query) {
  const result = { headers: {} };
  const res = {
    setHeader(key, value) { result.headers[key.toLowerCase()] = value; },
    status(value) { result.status = value; return this; },
    json(value) { result.body = value; return this; },
  };
  await handler({ method, query, headers: { cookie: 'salon_staff_session=synthetic-session' } }, res);
  return result;
}

test('Today proxy preserves the requested salon day and authorized location filter', async () => {
  const response = await request('GET', { tenant_id: tenant, day: '2026-10-14', location_id: location });
  assert.equal(response.status, 200);
  assert.equal(requests.at(-1).url,
    `/v1/tenants/${tenant}/reports/today?day=2026-10-14&location_id=${location}`);
  assert.equal(requests.at(-1).cookie, 'salon_staff_session=synthetic-session');
});

test('Today proxy rejects malformed filters and methods before upstream access', async () => {
  const beforeCount = requests.length;
  assert.equal((await request('GET', { tenant_id: 'bad' })).status, 400);
  assert.equal((await request('GET', { tenant_id: tenant, day: 'tomorrow' })).status, 400);
  assert.equal((await request('GET', { tenant_id: tenant, location_id: '../other' })).status, 400);
  assert.equal((await request('POST', { tenant_id: tenant })).status, 405);
  assert.equal(requests.length, beforeCount);
});

test('Today proxy preserves upstream error status and does not invent an old report', async () => {
  upstreamStatus = 503;
  payload = { detail: { code: 'report_unavailable' } };
  const response = await request('GET', { tenant_id: tenant });
  assert.equal(response.status, 503);
  assert.deepEqual(response.body, payload);
  upstreamStatus = 200;
});
