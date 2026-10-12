import { randomUUID } from "crypto";

// Stateless proxy, same contract as api/settings.js: forward the browser's cookies so the
// API resolves the caller from its own session and enforces tenant scope. The proxy never
// decides who the caller is and never trusts a tenant id from the client.
const API_BASE = process.env.API_BASE_URL;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTION = /^(approve|reject)$/;

export default async function handler(req, res) {
  const requestId = randomUUID();
  res.setHeader("X-Request-ID", requestId);

  if (!API_BASE) {
    return res.status(503).json({ detail: { code: "support_service_unconfigured" } });
  }

  const tenantId = req.query.tenant_id;
  if (!tenantId || Array.isArray(tenantId) || !UUID.test(String(tenantId))) {
    return res.status(400).json({ detail: { code: "invalid_tenant_id" } });
  }
  const grantId = req.query.grant_id ? String(req.query.grant_id) : null;
  if (grantId && !UUID.test(grantId)) {
    return res.status(400).json({ detail: { code: "invalid_grant_id" } });
  }
  const action = req.query.action ? String(req.query.action) : null;
  if (action && !ACTION.test(action)) {
    return res.status(400).json({ detail: { code: "invalid_action" } });
  }

  const method = req.method;
  const allowed = (!grantId && method === "GET")
    || (grantId && action && method === "POST");
  if (!allowed) {
    res.setHeader("Allow", !grantId ? "GET" : "POST");
    return res.status(405).json({ detail: { code: "method_not_allowed" } });
  }

  const cookies = req.headers.cookie || "";
  const headers = {
    "X-Request-ID": requestId,
    ...(cookies ? { cookie: cookies } : {}),
    ...(req.headers.origin ? { origin: req.headers.origin } : {}),
  };

  const upstreamPath = grantId
    ? `/v1/tenants/${tenantId}/support-access/${grantId}/${action}`
    : `/v1/tenants/${tenantId}/support-access`;

  let response;
  try {
    response = await fetch(new URL(upstreamPath, API_BASE), {
      method, headers, redirect: "manual",
    });
  } catch {
    return res.status(503).json({ detail: { code: "support_service_unavailable" } });
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
