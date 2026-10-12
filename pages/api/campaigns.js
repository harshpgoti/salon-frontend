import { randomUUID } from "crypto";

// Stateless proxy, same contract as api/settings.js: forward the browser's cookies so the
// API resolves the caller from its own session and enforces tenant scope. The proxy never
// decides who the caller is and never trusts a tenant id from the client.
const API_BASE = process.env.API_BASE_URL;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTION = /^(approve|cancel|test)$/;

export default async function handler(req, res) {
  const requestId = randomUUID();
  res.setHeader("X-Request-ID", requestId);

  if (!API_BASE) {
    return res.status(503).json({ detail: { code: "campaigns_service_unconfigured" } });
  }

  const tenantId = req.query.tenant_id;
  if (!tenantId || Array.isArray(tenantId) || !UUID.test(String(tenantId))) {
    return res.status(400).json({ detail: { code: "invalid_tenant_id" } });
  }
  const campaignId = req.query.campaign_id ? String(req.query.campaign_id) : null;
  if (campaignId && !UUID.test(campaignId)) {
    return res.status(400).json({ detail: { code: "invalid_campaign_id" } });
  }
  const action = req.query.action ? String(req.query.action) : null;
  if (action && !ACTION.test(action)) {
    return res.status(400).json({ detail: { code: "invalid_action" } });
  }

  const method = req.method;
  // GET lists; POST creates; POST with id+action approves/cancels/tests.
  const allowed = (!campaignId && (method === "GET" || method === "POST"))
    || (campaignId && !action && method === "PATCH")
    || (campaignId && action && method === "POST");
  if (!allowed) {
    res.setHeader("Allow", "GET, POST, PATCH");
    return res.status(405).json({ detail: { code: "method_not_allowed" } });
  }

  const cookies = req.headers.cookie || "";
  const headers = {
    "X-Request-ID": requestId,
    ...(cookies ? { cookie: cookies } : {}),
    ...(req.headers.origin ? { origin: req.headers.origin } : {}),
  };
  let body;
  const hasBody = req.body !== undefined && req.body !== null
    && !(typeof req.body === "object" && !Array.isArray(req.body) && Object.keys(req.body).length === 0);
  if (hasBody) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(req.body);
  }

  const upstreamPath = !campaignId ? `/v1/tenants/${tenantId}/campaigns`
    : !action ? `/v1/tenants/${tenantId}/campaigns/${campaignId}`
    : `/v1/tenants/${tenantId}/campaigns/${campaignId}/${action}`;

  let response;
  try {
    response = await fetch(new URL(upstreamPath, API_BASE), {
      method, headers, body, redirect: "manual",
    });
  } catch {
    return res.status(503).json({ detail: { code: "campaigns_service_unavailable" } });
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
