import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'node:http';

let server;
let base;
let loadPublicSalon;
let loadPublicAvailability;
const requests = [];

before(async () => {
  server = createServer((req, res) => {
    requests.push(req.url);
    if (req.url.endsWith('/hours')) {
      if (req.url.includes('/missing/')) { res.writeHead(404).end(); return; }
      if (req.url.includes('/failure/')) { res.writeHead(500).end(); return; }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ timezone: 'America/Toronto', tenant_id: 'private',
        weekly: [{ weekday: 0, opens_at: '09:00', closes_at: '12:00', effective_from: '2026-10-13', effective_to: null, location_id: 'private' },
          { weekday: 0, opens_at: '13:00', closes_at: '17:00', effective_from: '2026-10-13', effective_to: null }],
        exceptions: [{ exception_date: '2026-12-25', kind: 'closed', label: 'Holiday', id: 'private' }] }));
      return;
    }
    if (req.url.endsWith('/booking-profile')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ tenant_id: 'private', services: req.url.startsWith('/v1/public/salons/salon-a/')
        ? [{ id: '124b2c04-6d0e-48d6-9421-3db8105428c3', name: 'Synthetic cut',
          duration_minutes: 45, price_minor: 6500, currency: 'CAD', resource_name: 'private room',
          resource_id: 'private', tenant_id: 'private' }]
        : [] }));
      return;
    }
    if (req.url.includes('/availability?')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ timezone: 'America/Toronto', appointment_id: 'private',
        slots: [{ starts_at: '2026-10-14T10:00:00-04:00', ends_at: '2026-10-14T11:00:00-04:00',
          staff_id: '124b2c04-6d0e-48d6-9421-3db8105428c3', staff_name: 'Ava', local_date: '2026-10-14',
          local_time: '10:00', timezone: 'America/Toronto', client_name: 'private', resource_id: 'private' }] }));
      return;
    }
    if (req.url === '/v1/public/salons/missing') {
      res.writeHead(404).end();
      return;
    }
    if (req.url === '/v1/public/salons/failure') {
      res.writeHead(500).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      tenant_id: 'must-not-reach-the-page',
      business_name: 'Synthetic Salon', location_name: 'Main', timezone: 'America/Toronto',
      booking_policy: { text: 'Synthetic cancellation terms', version: 3 },
      branding: { brand_name: 'Synthetic Brand', primary_colour: '#334b39',
        accent_colour: 'url(javascript:alert(1))', cancellation_policy: 'private' },
      accepting_bookings: false,
      missing_setup: ['hours', 'unknown internal detail', 'service'],
    }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  ({ loadPublicSalon, loadPublicAvailability } = await import('../lib/publicSalon.mjs'));
});

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
});

test('public salon fetch projects branding/readiness and only known setup steps', async () => {
  const result = await loadPublicSalon('salon-a', { apiBase: base });
  assert.ok(requests.includes('/v1/public/salons/salon-a'));
  assert.ok(requests.includes('/v1/public/salons/salon-a/hours'));
  assert.ok(requests.includes('/v1/public/salons/salon-a/booking-profile'));
  assert.deepEqual(result, {
    state: 'salon',
    salon: {
      businessName: 'Synthetic Salon', locationName: 'Main', timezone: 'America/Toronto',
      publicHours: { timezone: 'America/Toronto', weekly: [
        { weekday: 0, opensAt: '09:00', closesAt: '12:00', effectiveFrom: '2026-10-13', effectiveTo: null },
        { weekday: 0, opensAt: '13:00', closesAt: '17:00', effectiveFrom: '2026-10-13', effectiveTo: null },
      ], exceptions: [{ date: '2026-12-25', kind: 'closed', opensAt: null, closesAt: null, label: 'Holiday' }] },
      branding: { brandName: 'Synthetic Brand', primaryColour: '#334b39', accentColour: null },
      bookingPolicy: { text: 'Synthetic cancellation terms', version: 3 },
      acceptingBookings: false, missingSetup: ['hours', 'service'], services: [{
        id: '124b2c04-6d0e-48d6-9421-3db8105428c3', name: 'Synthetic cut',
        durationMinutes: 45, priceMinor: 6500, currency: 'CAD',
      }],
    },
  });
  assert.equal(JSON.stringify(result).includes('tenant_id'), false);
  assert.equal(JSON.stringify(result).includes('private'), false);
  assert.equal(JSON.stringify(result).includes('tenant_id'), false);
});

test('unknown salons stay not-found and upstream failures fail closed', async () => {
  assert.deepEqual(await loadPublicSalon('missing', { apiBase: base }), { state: 'not_found' });
  assert.deepEqual(await loadPublicSalon('failure', { apiBase: base }), { state: 'unavailable' });
  assert.deepEqual(await loadPublicSalon('salon', { apiBase: '' }), { state: 'unavailable' });
});

test('public availability safely projects only salon-local slots and rejects invalid dates', async () => {
  const service = '124b2c04-6d0e-48d6-9421-3db8105428c3';
  const result = await loadPublicAvailability('salon-a', service, '2026-10-14', { apiBase: base });
  assert.deepEqual(result, { state: 'available', timezone: 'America/Toronto', slots: [{
    startsAt: '2026-10-14T10:00:00-04:00', endsAt: '2026-10-14T11:00:00-04:00',
    staffId: service, staffName: 'Ava', localDate: '2026-10-14', localTime: '10:00',
    timezone: 'America/Toronto',
  }] });
  assert.equal(JSON.stringify(result).includes('private'), false);
  assert.equal(requests.some(url => url.includes('date_from=2026-02-30')), false);
  assert.deepEqual(await loadPublicAvailability('salon-a', service, '2026-02-30', { apiBase: base }),
    { state: 'unavailable', slots: [] });
});
