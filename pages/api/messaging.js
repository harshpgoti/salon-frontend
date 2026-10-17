import { randomUUID } from "crypto";

// Stateless proxy, same contract as api/settings.js: forward the browser's cookies so the
// API resolves the caller from its own session and enforces tenant scope. The proxy never
// decides who the caller is and never trusts a tenant id from the client.
const API_BASE = process.env.API_BASE_URL;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

export default async function handler(req, res) {
  const requestId = randomUUID();
  res.setHeader("X-Request-ID", requestId);

  if (!API_BASE) {
    return res.status(503).json({ detail: { code: "messaging_service_unconfigured" } });
  }

  const tenantId = req.query.tenant_id;
  if (!tenantId || Array.isArray(tenantId) || !UUID.test(String(tenantId))) {
    return res.status(400).json({ detail: { code: "invalid_tenant_id" } });
  }

  const method = req.method;
  if (method !== "GET" && method !== "PUT") {
    res.setHeader("Allow", "GET, PUT");
    return res.status(405).json({ detail: { code: "method_not_allowed" } });
  }
  if (method === "PUT") {
    const { quiet_start, quiet_end, max_per_recipient_per_day } = req.body || {};
    if ((quiet_start == null) !== (quiet_end == null)) {
      return res.status(400).json({ detail: { code: "half_quiet_window" } });
    }
    for (const value of [quiet_start, quiet_end]) {
      if (value != null && !TIME.test(String(value))) {
        return res.status(400).json({ detail: { code: "invalid_quiet_time" } });
      }
    }
    if (max_per_recipient_per_day != null
        && (!Number.isInteger(max_per_recipient_per_day) || max_per_recipient_per_day < 1)) {
      return res.status(400).json({ detail: { code: "invalid_cap" } });
    }
  }

  const cookies = req.headers.cookie || "";
  const headers = {
    "X-Request-ID": requestId,
    ...(cookies ? { cookie: cookies } : {}),
    ...(req.headers.origin ? { origin: req.headers.origin } : {}),
  };
  let body;
  const hasBody = req.method !== "GET" && req.method !== "HEAD"
    && req.body !== undefined && req.body !== null
    && !(typeof req.body === "object" && !Array.isArray(req.body) && Object.keys(req.body).length === 0);
  if (hasBody) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(req.body);
  }

  let response;
  try {
    response = await fetch(new URL(`/v1/tenants/${tenantId}/messaging/settings`, API_BASE), {
      method, headers, body, redirect: "manual",
    });
  } catch {
    return res.status(503).json({ detail: { code: "messaging_service_unavailable" } });
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
