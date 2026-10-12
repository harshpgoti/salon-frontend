import { randomUUID } from "crypto";

// Stateless proxy, same contract as api/settings.js: forward the browser's cookies so the
// API resolves the caller from its own session and enforces tenant scope. The proxy never
// decides who the caller is and never trusts a tenant id from the client.
const API_BASE = process.env.API_BASE_URL;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RESOURCE = /^(plans|subscription|checkout|portal|invoices)$/;
const PLAN = /^(essential|growth|multi_location)$/;

export default async function handler(req, res) {
  const requestId = randomUUID();
  res.setHeader("X-Request-ID", requestId);

  if (!API_BASE) {
    return res.status(503).json({ detail: { code: "billing_service_unconfigured" } });
  }

  // settings.jsx calls /api/billing?tenant_id=… with the resource as the path remainder,
  // e.g. call("plans") -> /api/billing/plans. Next.js exposes it as slug segments.
  const slug = Array.isArray(req.query.slug) ? req.query.slug : [req.query.slug].filter(Boolean);
  const resource = slug[0] ?? String(req.query.resource ?? "plans");
  if (!RESOURCE.test(resource)) {
    return res.status(404).json({ detail: { code: "not_found" } });
  }

  const tenantId = req.query.tenant_id;
  if (!tenantId || Array.isArray(tenantId) || !UUID.test(String(tenantId))) {
    return res.status(400).json({ detail: { code: "invalid_tenant_id" } });
  }

  const method = req.method;
  const sub = slug[1] ? String(slug[1]) : null;
  if (sub && !/^(plan|cancel)$/.test(sub)) {
    return res.status(404).json({ detail: { code: "not_found" } });
  }
  const allowed = (resource === "plans" && method === "GET")
    || (resource === "subscription" && method === "GET" && !sub)
    || (resource === "subscription" && method === "POST" && !!sub)
    || (resource === "invoices" && method === "GET")
    || (resource === "checkout" && method === "POST" && !sub)
    || (resource === "portal" && method === "POST");
  if (!allowed) {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ detail: { code: "method_not_allowed" } });
  }
  if (resource === "checkout") {
    const planCode = req.body?.plan_code;
    if (!planCode || !PLAN.test(String(planCode))) {
      return res.status(400).json({ detail: { code: "invalid_plan_code" } });
    }
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

  const upstreamPath = `/v1/tenants/${tenantId}/billing/${slug.map(encodeURIComponent).join("/")}`;

  let response;
  try {
    response = await fetch(new URL(upstreamPath, API_BASE), {
      method, headers, body, redirect: "manual",
    });
  } catch {
    return res.status(503).json({ detail: { code: "billing_service_unavailable" } });
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
