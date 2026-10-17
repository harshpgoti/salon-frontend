import { randomUUID } from "crypto";

// Stateless proxy, same contract as api/settings.js: forward the browser's cookies so the
// API resolves the caller from its own session and enforces tenant scope. The proxy never
// decides who the caller is and never trusts a tenant id from the client.
const API_BASE = process.env.API_BASE_URL;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS = /^(open|done|dismissed|all)$/;

export default async function handler(req, res) {
  const requestId = randomUUID();
  res.setHeader("X-Request-ID", requestId);

  if (!API_BASE) {
    return res.status(503).json({ detail: { code: "inbox_service_unconfigured" } });
  }

  const tenantId = req.query.tenant_id;
  if (!tenantId || Array.isArray(tenantId) || !UUID.test(String(tenantId))) {
    return res.status(400).json({ detail: { code: "invalid_tenant_id" } });
  }
  const taskId = req.query.task_id ? String(req.query.task_id) : null;
  const action = req.query.action ? String(req.query.action) : "resolve";
  if (!["resolve", "reply"].includes(action)) {
    return res.status(400).json({ detail: { code: "invalid_action" } });
  }
  if (taskId && !UUID.test(taskId)) {
    return res.status(400).json({ detail: { code: "invalid_task_id" } });
  }

  const method = req.method;
  // GET the triage list (optional status filter); POST resolves one task.
  const status = req.query.status ? String(req.query.status) : "open";
  if (!STATUS.test(status)) {
    return res.status(400).json({ detail: { code: "invalid_status" } });
  }
  const allowed = (!taskId && method === "GET") || (taskId && method === "POST");
  if (!allowed) {
    res.setHeader("Allow", !taskId ? "GET" : "POST");
    return res.status(405).json({ detail: { code: "method_not_allowed" } });
  }

  const cookies = req.headers.cookie || "";
  const headers = {
    "X-Request-ID": requestId,
    ...(cookies ? { cookie: cookies } : {}),
    ...(req.headers.origin ? { origin: req.headers.origin } : {}),
    ...(req.headers["idempotency-key"] ? { "Idempotency-Key": req.headers["idempotency-key"] } : {}),
  };
  let body;
  const hasBody = req.method !== "GET" && req.method !== "HEAD"
    && req.body !== undefined && req.body !== null
    && !(typeof req.body === "object" && !Array.isArray(req.body) && Object.keys(req.body).length === 0);
  if (hasBody) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(req.body);
  }

  const upstreamPath = taskId
    ? `/v1/tenants/${tenantId}/inbox/${taskId}/${action}`
    : `/v1/tenants/${tenantId}/inbox?status=${encodeURIComponent(status)}`;

  let response;
  try {
    response = await fetch(new URL(upstreamPath, API_BASE), {
      method, headers, body, redirect: "manual",
    });
  } catch {
    return res.status(503).json({ detail: { code: "inbox_service_unavailable" } });
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
