import { randomUUID } from "crypto";

// The web tier holds no session of its own. It forwards the browser cookies to
// the identity API unchanged, so the API resolves the caller from its own
// session cookie and enforces tenant scope server-side. The proxy never
// decides who the caller is and never trusts a tenant id from the client.
const API_BASE = process.env.API_BASE_URL;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Path segments consumed by the route below. They must not be replayed as
// upstream query parameters.
const PATH_KEYS = new Set(["tenant_id", "collection", "id", "action"]);

function buildTarget(path, query) {
  const url = new URL(path, API_BASE);
  for (const [key, raw] of Object.entries(query || {})) {
    if (PATH_KEYS.has(key)) continue;
    for (const value of Array.isArray(raw) ? raw : [raw]) {
      url.searchParams.append(key, String(value));
    }
  }
  return url;
}

function allowedMethods(collection, identifier) {
  if (collection === "locations") return "GET";
  if (collection === "memberships") return identifier ? "PATCH, DELETE" : "GET";
  if (collection === "invitations") return identifier ? "POST" : "GET, POST";
  return "POST";
}

export default async function handler(req, res) {
  const requestId = randomUUID();
  res.setHeader("X-Request-ID", requestId);

  if (!API_BASE) {
    return res.status(503).json({ detail: { code: "team_service_unconfigured" } });
  }

  const tenantRaw = req.query.tenant_id;
  const tenantId = Array.isArray(tenantRaw) ? tenantRaw[0] : tenantRaw;
  if (!tenantId || !UUID.test(String(tenantId))) {
    return res.status(400).json({ detail: { code: "invalid_tenant_id" } });
  }

  const collection = String(req.query.collection ?? "memberships");
  const identifier = req.query.id ? String(req.query.id) : null;
  const action = req.query.action ? String(req.query.action) : null;

  let upstreamPath;
  if (collection === "memberships") {
    if (action) return res.status(404).json({ detail: { code: "not_found" } });
    if (identifier && !UUID.test(identifier)) {
      return res.status(400).json({ detail: { code: "invalid_member_id" } });
    }
    upstreamPath = `/v1/tenants/${tenantId}/memberships${identifier ? `/${identifier}` : ""}`;
  } else if (collection === "locations") {
    // Read-only helper the team page needs to present location choices.
    if (identifier || action) return res.status(404).json({ detail: { code: "not_found" } });
    upstreamPath = `/v1/tenants/${tenantId}/locations`;
  } else if (collection === "invitations" || collection === "ownership-transfers") {
    const permittedAction = collection === "invitations" ? ["revoke", "accept"] : ["accept"];
    if (action && !permittedAction.includes(action)) {
      return res.status(404).json({ detail: { code: "not_found" } });
    }
    if (identifier && !UUID.test(identifier)) {
      return res.status(400).json({ detail: { code: "invalid_identifier" } });
    }
    if (action && !identifier) {
      return res.status(404).json({ detail: { code: "not_found" } });
    }
    upstreamPath =
      `/v1/tenants/${tenantId}/${collection}` +
      (identifier ? `/${identifier}` : "") +
      (action ? `/${action}` : "");
  } else {
    return res.status(404).json({ detail: { code: "not_found" } });
  }

  const method = req.method;
  const allowed =
    (collection === "memberships" && !identifier && method === "GET") ||
    (collection === "memberships" && identifier && (method === "PATCH" || method === "DELETE")) ||
    (collection === "locations" && method === "GET") ||
    (collection === "invitations" && !identifier && (method === "GET" || method === "POST")) ||
    (collection === "invitations" && action && method === "POST") ||
    (collection === "ownership-transfers" && method === "POST");
  if (!allowed) {
    res.setHeader("Allow", allowedMethods(collection, identifier));
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

  let response;
  try {
    response = await fetch(buildTarget(upstreamPath, req.query), {
      method,
      headers,
      body,
      redirect: "manual",
    });
  } catch {
    return res.status(503).json({ detail: { code: "team_service_unavailable" } });
  }

  const upstreamRequestId = response.headers.get("x-request-id");
  if (upstreamRequestId) res.setHeader("X-Request-ID", upstreamRequestId);

  if (response.status === 204) return res.status(204).end();

  let parsed;
  try {
    parsed = await response.json();
  } catch {
    parsed = { detail: { code: "upstream_unreadable_response" } };
  }
  return res.status(response.status).json(parsed);
}
