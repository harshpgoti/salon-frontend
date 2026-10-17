import { randomUUID } from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9-]{3,80}$/i;
const HOLD_FIELDS = new Set(['service_id', 'staff_id', 'starts_at', 'idempotency_key']);
const CONFIRM_FIELDS = new Set(['owner_token', 'client_name', 'email', 'phone', 'country',
  'policy_accepted', 'policy_version', 'idempotency_key', 'marketing_opt_in', 'attribution_token']);
const CLAIM_FIELDS = new Set(['owner_token', 'idempotency_key']);

function bodyMatches(body, allowed) {
  return body && typeof body === 'object' && !Array.isArray(body)
    && Object.keys(body).every(key => allowed.has(key));
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  const requestId = randomUUID();
  res.setHeader('X-Request-ID', requestId);
  const base = process.env.API_BASE_URL;
  if (!base) return res.status(503).json({ detail: { code: 'booking_service_unconfigured' } });

  const operation = typeof req.query.operation === 'string' ? req.query.operation : '';
  const slug = typeof req.query.slug === 'string' ? req.query.slug : '';
  if (!SLUG.test(slug)) return res.status(400).json({ detail: { code: 'invalid_booking_slug' } });

  let path;
  let method;
  let headers = { Accept: 'application/json', 'X-Request-ID': requestId };
  let body;
  if (operation === 'hold') {
    if (req.method !== 'POST') return deny(res, ['POST']);
    if (!bodyMatches(req.body, HOLD_FIELDS)
        || !UUID.test(String(req.body.service_id || ''))
        || !UUID.test(String(req.body.staff_id || ''))
        || typeof req.body.starts_at !== 'string'
        || typeof req.body.idempotency_key !== 'string') {
      return res.status(400).json({ detail: { code: 'invalid_hold_request' } });
    }
    path = `/v1/public/salons/${encodeURIComponent(slug)}/holds`;
    method = 'POST'; body = req.body;
  } else if (operation === 'confirm') {
    const holdId = typeof req.query.hold_id === 'string' ? req.query.hold_id : '';
    if (req.method !== 'POST') return deny(res, ['POST']);
    if (!UUID.test(holdId) || !bodyMatches(req.body, CONFIRM_FIELDS)
        || typeof req.body.owner_token !== 'string') {
      return res.status(400).json({ detail: { code: 'invalid_confirmation_request' } });
    }
    path = `/v1/public/salons/${encodeURIComponent(slug)}/holds/${holdId}/confirm`;
    method = 'POST'; body = req.body;
  } else if (operation === 'claim') {
    const offerId = typeof req.query.offer_id === 'string' ? req.query.offer_id : '';
    if (req.method !== 'POST') return deny(res, ['POST']);
    if (!UUID.test(offerId) || !bodyMatches(req.body, CLAIM_FIELDS)
        || typeof req.body.owner_token !== 'string' || req.body.owner_token.length < 16
        || req.body.owner_token.length > 128
        || typeof req.body.idempotency_key !== 'string'
        || req.body.idempotency_key.length < 8 || req.body.idempotency_key.length > 64) {
      return res.status(400).json({ detail: { code: 'invalid_claim_request' } });
    }
    path = `/v1/public/salons/${encodeURIComponent(slug)}/offers/${offerId}/claim`;
    method = 'POST'; body = req.body;
  } else if (operation === 'manage') {
    const appointmentId = typeof req.query.appointment_id === 'string' ? req.query.appointment_id : '';
    if (req.method !== 'POST') return deny(res, ['POST']);
    if (!UUID.test(appointmentId) || !bodyMatches(req.body, new Set(['token']))
        || typeof req.body.token !== 'string' || req.body.token.length < 32 || req.body.token.length > 128) {
      return res.status(400).json({ detail: { code: 'invalid_management_request' } });
    }
    path = `/v1/public/salons/${encodeURIComponent(slug)}/manage/${appointmentId}`;
    method = 'GET';
    headers.Authorization = `Bearer ${req.body.token}`;
  } else if (operation === 'manage_cancel' || operation === 'manage_reschedule') {
    const appointmentId = typeof req.query.appointment_id === 'string' ? req.query.appointment_id : '';
    const allowed = operation === 'manage_cancel'
      ? new Set(['token', 'expected_version', 'idempotency_key'])
      : new Set(['token', 'expected_version', 'starts_at', 'idempotency_key']);
    const token = req.body?.token;
    const validStart = typeof req.body?.starts_at === 'string'
      && /(?:Z|[+-]\d{2}:\d{2})$/i.test(req.body.starts_at)
      && Number.isFinite(Date.parse(req.body.starts_at));
    if (req.method !== 'POST') return deny(res, ['POST']);
    if (!UUID.test(appointmentId) || !bodyMatches(req.body, allowed)
        || typeof token !== 'string' || token.length < 32 || token.length > 128
        || !Number.isSafeInteger(req.body.expected_version) || req.body.expected_version < 1
        || typeof req.body.idempotency_key !== 'string'
        || req.body.idempotency_key.length < 8 || req.body.idempotency_key.length > 64
        || (operation === 'manage_reschedule' && !validStart)) {
      return res.status(400).json({ detail: { code: 'invalid_management_request' } });
    }
    path = `/v1/public/salons/${encodeURIComponent(slug)}/manage/${appointmentId}/${operation === 'manage_cancel' ? 'cancel' : 'reschedule'}`;
    method = 'POST';
    headers.Authorization = `Bearer ${token}`;
    const { token: _token, ...command } = req.body;
    body = command;
  } else {
    return res.status(404).json({ detail: { code: 'not_found' } });
  }

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }
  try {
    const upstream = await fetch(new URL(path, base), {
      method, headers, ...(body !== undefined ? { body } : {}),
      redirect: 'manual', signal: AbortSignal.timeout(10000),
    });
    const requestTrace = upstream.headers.get('x-request-id');
    if (requestTrace) res.setHeader('X-Request-ID', requestTrace);
    if (upstream.status === 204) return res.status(204).end();
    let payload;
    try { payload = await upstream.json(); }
    catch { payload = { detail: { code: 'upstream_unreadable_response' } }; }
    return res.status(upstream.status).json(payload);
  } catch {
    return res.status(503).json({ detail: { code: 'booking_service_unavailable' } });
  }
}

function deny(res, allowed) {
  res.setHeader('Allow', allowed.join(', '));
  return res.status(405).json({ detail: { code: 'method_not_allowed' } });
}
