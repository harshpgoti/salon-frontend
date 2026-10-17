import { randomUUID } from "crypto";

// Stateless proxy, same contract as api/settings.js: forward the browser's cookies so the
// API resolves the caller from its own session and enforces tenant scope. The proxy never
// decides who the caller is and never trusts a tenant id from the client.
const API_BASE = process.env.API_BASE_URL;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RESOURCE = /^(cycles|rules|preview|overrides)$/;

export default async function handler(req, res) {
  const requestId = randomUUID();
  res.setHeader("X-Request-ID", requestId);

  if (!API_BASE) {
    return res.status(503).json({ detail: { code: "retention_service_unconfigured" } });
  }

  const tenantId = req.query.tenant_id;
  if (!tenantId || Array.isArray(tenantId) || !UUID.test(String(tenantId))) {
    return res.status(400).json({ detail: { code: "invalid_tenant_id" } });
  }
  const resource = String(req.query.resource ?? "cycles");
  if (!RESOURCE.test(resource)) {
    return res.status(404).json({ detail: { code: "not_found" } });
  }
  const ruleId = req.query.rule_id ? String(req.query.rule_id) : null;
  if (ruleId && !UUID.test(ruleId)) {
    return res.status(400).json({ detail: { code: "invalid_rule_id" } });
  }

  const method = req.method;
  // cycles: GET list (optional status/client_id). rules: GET list, POST create.
  // preview: POST one rule's preview. overrides: POST one client override.
  const allowed = (resource === "cycles" && method === "GET")
    || (resource === "rules" && (method === "GET" || (method === "POST" && !ruleId)))
    || (resource === "preview" && method === "POST" && ruleId)
    || (resource === "overrides" && method === "POST");
  if (!allowed) {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ detail: { code: "method_not_allowed" } });
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

  // Routing parameters never travel upstream as query values.
  const params = new URLSearchParams();
  for (const key of ["status", "client_id"]) {
    if (req.query[key]) params.append(key, String(req.query[key]));
  }
  const suffix = params.toString() ? `?${params}` : "";
  const upstreamPath = resource === "cycles" ? `/v1/tenants/${tenantId}/rebooking-cycles${suffix}`
    : resource === "rules" ? `/v1/tenants/${tenantId}/rebooking-rules`
    : resource === "preview" ? `/v1/tenants/${tenantId}/rebooking-rules/${ruleId}/preview`
    : `/v1/tenants/${tenantId}/rebooking-overrides`;

  let response;
  try {
    response = await fetch(new URL(upstreamPath, API_BASE), {
      method, headers, body, redirect: "manual",
    });
  } catch {
    return res.status(503).json({ detail: { code: "retention_service_unavailable" } });
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
