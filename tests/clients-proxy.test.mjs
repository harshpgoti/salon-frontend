import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'node:http';

const tenant = '11111111-1111-4111-8111-111111111111';
const definition = '22222222-2222-4222-8222-222222222222';
let server, handler;
const requests = [];
before(async () => {
  server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    requests.push({ method: req.method, url: req.url, headers: req.headers, body });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: definition, label: 'Changed label' }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  process.env.API_BASE_URL = 'http://127.0.0.1:' + server.address().port;
  handler = (await import('../pages/api/clients.js')).default;
});
after(async () => { await new Promise(resolve => server.close(resolve)); });

async function request(method, query, body, target = handler) {
  const result = { headers: {} };
  const res = {
    setHeader(key, value) { result.headers[key.toLowerCase()] = value; },
    status(value) { result.status = value; return this; },
    json(value) { result.body = value; return this; },
  };
  await target({ method, query, body, headers: {
    cookie: 'salon_staff_session=synthetic-session', origin: 'https://salon.example.invalid',
  } }, res);
  return result;
}

test('TASK-011/AC-1: tenant field-definition PATCH reaches the backend', async () => {
  const result = await request('PATCH', {
    tenant_id: tenant, resource: 'field-definitions', field_definition_id: definition,
  }, { label: 'Changed label' });
  assert.equal(result.status, 200);
  assert.equal(requests.at(-1).url, '/v1/tenants/' + tenant + '/field-definitions/' + definition);
  assert.equal(requests.at(-1).method, 'PATCH');
  assert.deepEqual(JSON.parse(requests.at(-1).body), { label: 'Changed label' });
  assert.equal(requests.at(-1).headers.cookie, 'salon_staff_session=synthetic-session');
  assert.equal(requests.at(-1).headers.origin, 'https://salon.example.invalid');
});

test('client profile create and assigned-location values are forwarded without changing the API contract', async () => {
  const result = await request('POST', { tenant_id: tenant }, {
    name: 'Salon client', preferred_location_id: '33333333-3333-4333-8333-333333333333', contacts: [],
  });
  assert.equal(result.status, 200);
  assert.equal(requests.at(-1).url, '/v1/tenants/' + tenant + '/clients');
  assert.equal(JSON.parse(requests.at(-1).body).preferred_location_id, '33333333-3333-4333-8333-333333333333');
});

test('adding a contact reaches the client-scoped contact route', async () => {
  const client = '44444444-4444-4444-8444-444444444444';
  const result = await request('POST', { tenant_id: tenant, client_id: client, resource: 'contacts' }, {
    kind: 'email', value: 'new@example.invalid',
  });
  assert.equal(result.status, 200);
  assert.equal(requests.at(-1).url, `/v1/tenants/${tenant}/clients/${client}/contacts`);
  assert.deepEqual(JSON.parse(requests.at(-1).body), { kind: 'email', value: 'new@example.invalid' });
});

test('field-definition collection GET preserves filters and removes route parameters', async () => {
  const result = await request('GET', { tenant_id: tenant, resource: 'field-definitions', active: 'true' });
  assert.equal(result.status, 200);
  assert.equal(requests.at(-1).url, '/v1/tenants/' + tenant + '/field-definitions?active=true');
});

test('field-definition collection POST reaches creation', async () => {
  const result = await request('POST', { tenant_id: tenant, resource: 'field-definitions' }, { label: 'Preference', type: 'text' });
  assert.equal(result.status, 200);
  assert.equal(requests.at(-1).method, 'POST');
});

test('campaign pause and resume actions reach only their fixed authenticated routes', async () => {
  const campaigns = (await import('../pages/api/campaigns.js')).default;
  for (const action of ['pause', 'resume']) {
    const before = requests.length;
    const result = await request('POST', {
      tenant_id: tenant, campaign_id: definition, action,
    }, {}, campaigns);
    assert.equal(result.status, 200);
    assert.equal(requests.length, before + 1);
    assert.equal(requests.at(-1).url,
      `/v1/tenants/${tenant}/campaigns/${definition}/${action}`);
    assert.equal(requests.at(-1).method, 'POST');
    assert.equal(requests.at(-1).headers.cookie, 'salon_staff_session=synthetic-session');
  }
  const before = requests.length;
  assert.equal((await request('POST', {
    tenant_id: tenant, campaign_id: definition, action: 'delete-anything',
  }, {}, campaigns)).status, 400);
  assert.equal(requests.length, before);
});

test('a specific definition rejects DELETE with the correct Allow header', async () => {
  const before = requests.length;
  const result = await request('DELETE', { tenant_id: tenant, resource: 'field-definitions', field_definition_id: definition });
  assert.equal(result.status, 405);
  assert.equal(result.headers.allow, 'PATCH');
  assert.equal(requests.length, before);
});

test('an invalid definition ID is refused before calling the backend', async () => {
  const before = requests.length;
  const result = await request('PATCH', { tenant_id: tenant, resource: 'field-definitions', field_definition_id: 'bad/id' });
  assert.equal(result.status, 400);
  assert.equal(requests.length, before);
});

test('import row correction is a scoped PATCH through the recording backend', async () => {
  const importId = '55555555-5555-4555-8555-555555555555';
  const result = await request('PATCH', {
    tenant_id: tenant, resource: 'imports', import_id: importId,
    import_action: 'correct', row_number: '2',
  }, { expected_version: 3, values: { lifecycle: 'active' } });
  assert.equal(result.status, 200);
  assert.equal(requests.at(-1).url, `/v1/tenants/${tenant}/imports/${importId}/rows/2`);
  assert.equal(requests.at(-1).method, 'PATCH');
  assert.deepEqual(JSON.parse(requests.at(-1).body), { expected_version: 3, values: { lifecycle: 'active' } });
});

test('merge preview and commit are scoped allowlisted actions', async () => {
  const preview = await request('POST', { tenant_id: tenant, resource: 'merges', merge_action: 'preview' }, {
    survivor_client_id: '44444444-4444-4444-8444-444444444444',
    merged_client_id: '55555555-5555-4555-8555-555555555555',
  });
  assert.equal(preview.status, 200);
  assert.equal(requests.at(-1).url, `/v1/tenants/${tenant}/client-merges/preview`);
  assert.equal(requests.at(-1).method, 'POST');
  const commit = await request('POST', { tenant_id: tenant, resource: 'merges', merge_action: 'commit' }, {
    survivor_client_id: '44444444-4444-4444-8444-444444444444',
    merged_client_id: '55555555-5555-4555-8555-555555555555',
    expected_survivor_version: 1, expected_merged_version: 1,
    acknowledged_conflicts: true, idempotency_key: 'merge-retry-key-001',
  });
  assert.equal(commit.status, 200);
  assert.equal(requests.at(-1).url, `/v1/tenants/${tenant}/client-merges/commit`);
  assert.equal(requests.at(-1).method, 'POST');
  assert.equal(requests.at(-1).headers.cookie, 'salon_staff_session=synthetic-session');
});

test('privacy hold list and release are tenant scoped allowlisted actions', async () => {
  const hold = '66666666-6666-4666-8666-666666666666';
  const holds = await request('GET', { tenant_id: tenant, resource: 'privacy', privacy_action: 'holds',
    client_id: '55555555-5555-4555-8555-555555555555' });
  assert.equal(holds.status, 200);
  assert.equal(requests.at(-1).url, `/v1/tenants/${tenant}/retention-holds?client_id=55555555-5555-4555-8555-555555555555`);
  const released = await request('POST', { tenant_id: tenant, resource: 'privacy',
    privacy_action: 'hold_release', hold_id: hold }, { reason: 'reviewed and resolved' });
  assert.equal(released.status, 200);
  assert.equal(requests.at(-1).url, `/v1/tenants/${tenant}/retention-holds/${hold}/release`);
  assert.equal(requests.at(-1).method, 'POST');
});

test('pending privacy cleanup requests are recovered through the tenant request list', async () => {
  const listed = await request('GET', { tenant_id: tenant, resource: 'privacy', privacy_action: 'requests' });
  assert.equal(listed.status, 200);
  assert.equal(requests.at(-1).url, `/v1/tenants/${tenant}/privacy-requests`);
  assert.equal(requests.at(-1).method, 'GET');
  const before = requests.length;
  const invalid = await request('GET', { tenant_id: tenant, resource: 'privacy', privacy_action: 'unknown' });
  assert.equal(invalid.status, 404);
  assert.equal(requests.length, before);
});

// Next.js can provide an empty string for a bodyless GET.
test('GET search with an empty parsed body reaches the API without a request body', async () => {
  const result = await request('GET', { tenant_id: tenant, resource: 'search' }, '');
  assert.equal(result.status, 200);
  assert.equal(requests.at(-1).method, 'GET');
  assert.equal(requests.at(-1).url, '/v1/tenants/' + tenant + '/clients/search');
  assert.equal(requests.at(-1).body, '');
});

const getProxies = [
  ['audience.js', {}, '/segments'],
  ['campaigns.js', {}, '/campaigns'],
  ['billing/[...slug].js', { slug: ['plans'] }, '/billing/plans'],
  ['inbox.js', {}, '/inbox?status=open'],
  ['messaging.js', {}, '/messaging/settings'],
  ['retention.js', {}, '/rebooking-cycles'],
  ['settings.js', { resource: 'setup' }, '/setup'],
  ['settings.js', { resource: 'locations' }, '/locations'],
  ['senders.js', {}, '/sms-senders'],
  ['team.js', { collection: 'memberships' }, '/memberships'],
];
for (const [file, query, suffix] of getProxies) {
  test(file + ': bodyless GET reaches the recording upstream', async () => {
    const target = (await import('../pages/api/' + file)).default;
    const result = await request('GET', { tenant_id: tenant, ...query }, '', target);
    assert.equal(result.status, 200);
    assert.equal(requests.at(-1).url, '/v1/tenants/' + tenant + suffix);
    assert.equal(requests.at(-1).method, 'GET');
    assert.equal(requests.at(-1).body, '');
    assert.equal(requests.at(-1).headers.cookie, 'salon_staff_session=synthetic-session');
    assert.equal(requests.at(-1).headers.origin, 'https://salon.example.invalid');
  });
}

test('settings proxy keeps locations read-only for the public booking preview', async () => {
  const target = (await import('../pages/api/settings.js')).default;
  const before = requests.length;
  const result = await request('PATCH', { tenant_id: tenant, resource: 'locations' }, { booking_slug: 'forged' }, target);
  assert.equal(result.status, 405);
  assert.equal(result.headers.allow, 'GET');
  assert.equal(requests.length, before);
});

test('billing checkout proxy forwards the owner session and plan without accepting payment details', async () => {
  const target = (await import('../pages/api/billing/[...slug].js')).default;
  const result = await request('POST', { tenant_id: tenant, slug: ['checkout'] },
    { plan_code: 'growth' }, target);
  assert.equal(result.status, 200);
  assert.equal(requests.at(-1).url, `/v1/tenants/${tenant}/billing/checkout`);
  assert.equal(requests.at(-1).method, 'POST');
  assert.deepEqual(JSON.parse(requests.at(-1).body), { plan_code: 'growth' });
  assert.equal(requests.at(-1).headers.cookie, 'salon_staff_session=synthetic-session');
  assert.equal(requests.at(-1).headers.origin, 'https://salon.example.invalid');
});
