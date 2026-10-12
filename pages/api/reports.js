import { randomUUID } from "crypto";

// Stateless proxy, same contract as api/settings.js: forward the browser's cookies so the
// API resolves the caller from its own session and enforces tenant scope. The proxy never
// decides who the caller is and never trusts a tenant id from the client.
const API_BASE = process.env.API_BASE_URL;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const REPORT = /^(today|operational|clients|marketing)$/;

export default async function handler(req, res) {
  const requestId = randomUUID();
  res.setHeader("X-Request-ID", requestId);

  if (!API_BASE) {
    return res.status(503).json({ detail: { code: "reports_service_unconfigured" } });
  }
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ detail: { code: "method_not_allowed" } });
  }

  const tenantId = req.query.tenant_id;
  if (!tenantId || Array.isArray(tenantId) || !UUID.test(String(tenantId))) {
    return res.status(400).json({ detail: { code: "invalid_tenant_id" } });
  }
  const report = String(req.query.report ?? "today");
  if (!REPORT.test(report)) {
    return res.status(404).json({ detail: { code: "not_found" } });
  }
  const params = new URLSearchParams();
  for (const key of ["day", "date_from", "date_to", "as_of", "location_id", "staff_id", "service_id"]) {
    if (req.query[key]) params.append(key, String(req.query[key]));
  }
  if ((params.get("day") && !DAY.test(params.get("day")))
    || (params.get("date_from") && !DAY.test(params.get("date_from")))
    || (params.get("date_to") && !DAY.test(params.get("date_to")))
    || (params.get("as_of") && !DAY.test(params.get("as_of")))
    || (params.get("location_id") && !UUID.test(params.get("location_id")))
    || (params.get("staff_id") && !UUID.test(params.get("staff_id")))
    || (params.get("service_id") && !UUID.test(params.get("service_id")))) {
    return res.status(400).json({ detail: { code: "invalid_filter" } });
  }

  const cookies = req.headers.cookie || "";
  const headers = {
    "X-Request-ID": requestId,
    ...(cookies ? { cookie: cookies } : {}),
    ...(req.headers.origin ? { origin: req.headers.origin } : {}),
  };
  const suffix = params.toString() ? `?${params}` : "";

  let response;
  try {
    response = await fetch(new URL(`/v1/tenants/${tenantId}/reports/${report}${suffix}`, API_BASE), {
      method: "GET", headers, redirect: "manual",
    });
  } catch {
    return res.status(503).json({ detail: { code: "reports_service_unavailable" } });
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
