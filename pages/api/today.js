import { randomUUID } from "crypto";

// Stateless proxy, same contract as api/settings.js: forward the browser's cookies so the
// API resolves the caller from its own session and enforces tenant scope. The proxy never
// decides who the caller is and never trusts a tenant id from the client.
const API_BASE = process.env.API_BASE_URL;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export default async function handler(req, res) {
  const requestId = randomUUID();
  res.setHeader("X-Request-ID", requestId);

  if (!API_BASE) {
    return res.status(503).json({ detail: { code: "today_service_unconfigured" } });
  }
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ detail: { code: "method_not_allowed" } });
  }

  const tenantId = req.query.tenant_id;
  if (!tenantId || Array.isArray(tenantId) || !UUID.test(String(tenantId))) {
    return res.status(400).json({ detail: { code: "invalid_tenant_id" } });
  }
  if (req.query.day && !DAY.test(String(req.query.day))) {
    return res.status(400).json({ detail: { code: "invalid_day" } });
  }
  if (req.query.location_id && !UUID.test(String(req.query.location_id))) {
    return res.status(400).json({ detail: { code: "invalid_location_id" } });
  }

  const cookies = req.headers.cookie || "";
  const headers = {
    "X-Request-ID": requestId,
    ...(cookies ? { cookie: cookies } : {}),
    ...(req.headers.origin ? { origin: req.headers.origin } : {}),
  };

  const params = new URLSearchParams();
  for (const key of ["day", "location_id"]) {
    if (req.query[key]) params.append(key, String(req.query[key]));
  }
  const suffix = params.toString() ? `?${params}` : "";

  let response;
  try {
    response = await fetch(new URL(`/v1/tenants/${tenantId}/reports/today${suffix}`, API_BASE), {
      method: "GET", headers, redirect: "manual",
    });
  } catch {
    return res.status(503).json({ detail: { code: "today_service_unavailable" } });
  }

  const upstreamRequestId = response.headers.get("x-request-id");
  if (upstreamRequestId) res.setHeader("X-Request-ID", upstreamRequestId);

  let parsed;
  try {
    parsed = await response.json();
  } catch {
    parsed = { detail: { code: "upstream_unreadable_response" } };
  }
  return res.status(response.status).json(parsed);
}
