import test from "node:test";
import assert from "node:assert/strict";
import { operationalReportCsv } from "../lib/operationalReportCsv.js";

test("operational CSV includes filters, metric definitions, denominators, and freshness", () => {
  const csv = operationalReportCsv({
    generated_at: "2026-10-14T12:00:00Z", date_from: "2026-10-01", date_to: "2026-10-14",
    timezone: "America/Toronto", filters: { location_id: "loc-1", staff_id: null, service_id: null },
    bookings: { total: 3, by_state: { confirmed: 2, completed: 1 } },
    rates: { no_show_rate: { numerator: 1, denominator: 2, value: 0.5 } },
    service_mix: [{ service: '=IMPORT("unsafe")', bookings: 1, booked_minor: 5000 }],
    staff_utilization: [{ staff_id: "staff-1", utilization: 0.5, booked_minutes: 60, scheduled_minutes: 120 }],
    forecast_booked_value_minor: 5000,
    recorded_receipts: { by_kind: { refund: { entries: 1, minor: -500 } }, gross_minor: 0, refunds_minor: 500, adjustments_minor: 0, net_minor: -500 },
    definitions: { basis: "=SUM(1,2)", utilization: "Booked / available minutes", service_mix: "Per service." },
  });
  assert.match(csv, /Generated at \(UTC\)/);
  assert.match(csv, /Inclusive local calendar dates/);
  assert.match(csv, /no_show_rate/);
  assert.match(csv, /Definition: utilization/);
  assert.match(csv, /"Definition: basis","'=SUM\(1,2\)"/);
  assert.match(csv, /Service: =IMPORT\(""unsafe""\)/);
});

test("operational report proxy forwards only validated report filters with the session", async () => {
  process.env.API_BASE_URL = "http://reports.example.invalid";
  const { default: handler } = await import(`../pages/api/reports.js?operational=${Date.now()}`);
  let target;
  let forwarded;
  globalThis.fetch = async (url, options) => {
    target = new URL(url); forwarded = options;
    return { status: 200, headers: new Headers(), json: async () => ({ ok: true }) };
  };
  const req = { method: "GET", query: {
    tenant_id: "11111111-1111-4111-8111-111111111111", report: "operational",
    date_from: "2026-10-01", date_to: "2026-10-31",
    location_id: "22222222-2222-4222-8222-222222222222",
    staff_id: "33333333-3333-4333-8333-333333333333",
    service_id: "44444444-4444-4444-8444-444444444444", ignored: "drop",
  }, headers: { cookie: "salon_session=synthetic" } };
  const result = { statusCode: 0, headers: {}, body: null,
    setHeader(k, v) { this.headers[k] = v; }, status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; } };
  await handler(req, result);
  assert.equal(result.statusCode, 200);
  assert.equal(target.pathname, "/v1/tenants/11111111-1111-4111-8111-111111111111/reports/operational");
  assert.equal(target.searchParams.get("staff_id"), req.query.staff_id);
  assert.equal(target.searchParams.has("ignored"), false);
  assert.equal(forwarded.headers.cookie, req.headers.cookie);
});
