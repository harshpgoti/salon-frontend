import { randomUUID } from "crypto";

const API_BASE = process.env.API_BASE_URL;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RESOURCES = new Set(["senders", "templates", "communications"]);
const ACTIONS = new Set(["submit", "decide"]);

export default async function handler(req, res) {
  const requestId = randomUUID();
  res.setHeader("X-Request-ID", requestId);
  if (!API_BASE) return res.status(503).json({ detail: { code: "whatsapp_service_unconfigured" } });

  const tenant = req.query.tenant_id;
  const resource = req.query.resource;
  const itemId = req.query.item_id;
  const action = req.query.action;
  if (!tenant || Array.isArray(tenant) || !UUID.test(String(tenant))) {
    return res.status(400).json({ detail: { code: "invalid_tenant_id" } });
  }
  if (Array.isArray(resource) || !RESOURCES.has(String(resource))) {
    return res.status(404).json({ detail: { code: "not_found" } });
  }
  if (itemId !== undefined && (Array.isArray(itemId) || !UUID.test(String(itemId)))) {
    return res.status(400).json({ detail: { code: "invalid_item_id" } });
  }
  if (action !== undefined && (Array.isArray(action) || !ACTIONS.has(String(action)))) {
    return res.status(400).json({ detail: { code: "invalid_action" } });
  }

  const method = req.method;
  const collection = itemId === undefined;
  const allowed = resource === "communications"
    ? collection && method === "GET" && action === undefined
    : collection
      ? (method === "GET" || method === "POST") && action === undefined
      : method === "POST" && Boolean(action);
  if (!allowed) {
    res.setHeader("Allow", resource === "communications" ? "GET" : collection ? "GET, POST" : "POST");
    return res.status(405).json({ detail: { code: "method_not_allowed" } });
  }

  const pathResource = resource === "senders" ? "whatsapp-senders"
    : resource === "templates" ? "whatsapp-templates" : "whatsapp-communications";
  const path = `/v1/tenants/${tenant}/${pathResource}`
    + (itemId ? `/${itemId}${action ? `/${action}` : ""}` : "");
  const headers = {
    "X-Request-ID": requestId,
    ...(req.headers.cookie ? { cookie: req.headers.cookie } : {}),
    ...(req.headers.origin ? { origin: req.headers.origin } : {}),
  };
  const hasBody = method !== "GET" && req.body != null;
  if (hasBody) headers["Content-Type"] = "application/json";
  let response;
  try {
    response = await fetch(new URL(path, API_BASE), {
      method, headers, ...(hasBody ? { body: JSON.stringify(req.body) } : {}), redirect: "manual",
    });
  } catch {
    return res.status(503).json({ detail: { code: "whatsapp_service_unavailable" } });
  }
  const upstreamRequestId = response.headers.get("x-request-id");
  if (upstreamRequestId) res.setHeader("X-Request-ID", upstreamRequestId);
  let body;
  try { body = await response.json(); }
  catch { body = { detail: { code: "upstream_unreadable_response" } }; }
  return res.status(response.status).json(body);
}
