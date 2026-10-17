import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'node:http';

let server;
let workspace;
const requests = [];

before(async () => {
  server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    requests.push({ url: req.url, method: req.method, body });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ service_id: '44444444-4444-4444-8444-444444444444', version: 2, phases: [] }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  process.env.API_BASE_URL = `http://127.0.0.1:${server.address().port}`;
  workspace = (await import('../pages/api/workspace.js')).default;
});

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  delete process.env.API_BASE_URL;
});

async function call(method, query, body) {
  const result = { headers: {} };
  const res = {
    setHeader(name, value) { result.headers[name.toLowerCase()] = value; },
    status(code) { result.status = code; return this; },
    json(value) { result.body = value; return this; },
    end(value) { result.body = value; return this; },
  };
  await workspace({ method, query, body, headers: { cookie: 'salon_staff_session=synthetic' } }, res);
  return result;
}

test('service phase configuration is an allowlisted tenant route', async () => {
  const query = { tenant_id: '11111111-1111-4111-8111-111111111111', resource: 'services',
    id: '44444444-4444-4444-8444-444444444444', action: 'phases' };
  assert.equal((await call('GET', query)).status, 200);
  assert.equal(requests.at(-1).url, `/v1/tenants/${query.tenant_id}/services/${query.id}/phases`);
  const phases = { expected_version: 1, phases: [
    { sequence: 1, duration_minutes: 20, mode: 'attended', staff_count: 1 },
    { sequence: 2, duration_minutes: 40, mode: 'gap', staff_count: 0 },
  ] };
  assert.equal((await call('PUT', query, phases)).status, 200);
  assert.deepEqual(JSON.parse(requests.at(-1).body), phases);
  const count = requests.length;
  assert.equal((await call('GET', { ...query, id: '../company' })).status, 400);
  assert.equal((await call('DELETE', query)).status, 405);
  assert.equal(requests.length, count);
});
