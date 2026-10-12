import { randomUUID } from "crypto";

// Stateless proxy, same contract as api/team.js: forward the browser's cookies so the
// API resolves the caller from its own session and enforces tenant scope. The proxy never
// decides who the caller is and never trusts a tenant id from the client.
const API_BASE = process.env.API_BASE_URL;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STEP = /^[a-z_]{1,32}$/;
const RESOURCES = new Set(["setup", "settings"]);

function buildTarget(path, query) {
  const url = new URL(path, API_BASE);
  for (const [key, raw] of Object.entries(query || {})) {
    // Never replay routing parameters upstream as query values.
    if (["tenant_id", "resource", "step"].includes(key)) continue;
    for (const value of Array.isArray(raw) ? raw : [raw]) {
      url.searchParams.append(key, String(value));
    }
  }
  return url;
}

export default async function handler(req, res) {
  const requestId = randomUUID();
  res.setHeader("X-Request-ID", requestId);

  if (!API_BASE) {
    return res.status(503).json({ detail: { code: "settings_service_unconfigured" } });
  }

  const tenantId = req.query.tenant_id;
  if (!tenantId || Array.isArray(tenantId) || !UUID.test(String(tenantId))) {
    return res.status(400).json({ detail: { code: "invalid_tenant_id" } });
  }
  const resource = String(req.query.resource ?? "setup");
  if (!RESOURCES.has(resource)) {
    return res.status(404).json({ detail: { code: "not_found" } });
  }
  const step = req.query.step ? String(req.query.step) : null;
  if (step && !STEP.test(step)) {
    return res.status(400).json({ detail: { code: "invalid_setup_step" } });
  }

  const method = req.method;
  // Only two request shapes have an API route: PATCH a single setup step, and GET or
  // PATCH the resource root. Anything else is refused here rather than forwarded to
  // produce a routing error from the API.
  const allowed = step ? (method === "PATCH" && resource === "setup")
    : (method === "GET" || (method === "PATCH" && resource === "settings"));
  if (!allowed) {
    res.setHeader("Allow", step ? "PATCH" : "GET, PATCH");
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

  const upstreamPath = `/v1/tenants/${tenantId}/${resource}` + (step ? `/${step}` : "");

  let response;
  try {
    response = await fetch(buildTarget(upstreamPath, req.query), {
      method, headers, body, redirect: "manual",
    });
  } catch {
    return res.status(503).json({ detail: { code: "settings_service_unavailable" } });
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