import { useCallback, useEffect, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";

const panel = { background: "#ffffff", border: "1px solid #e8e6df", borderRadius: 14, padding: 20, marginBottom: 18 };
const muted = { color: "#747970", fontSize: 13 };
const input = { display: "block", width: "100%", boxSizing: "border-box", marginTop: 6, padding: 10, border: "1px solid #c9c6bd", borderRadius: 7 };
const button = { padding: "10px 16px", background: "#334b39", color: "#fff", border: 0, borderRadius: 8, cursor: "pointer" };

function errorText(payload, fallback) {
  const detail = payload?.detail;
  if (typeof detail === "string") return detail;
  if (detail?.code) return detail.code.replace(/_/g, " ");
  return fallback;
}

const money = (minor) => `$${((minor || 0) / 100).toFixed(2)}`;

// Owner operational report (TASK-042): bookings, rates, mix, clients, forecast,
// utilization and recorded receipts — every figure defined in the response.
export default function Reports() {
  const router = useRouter();
  const [tenantId, setTenantId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [report, setReport] = useState(null);
  const [cohorts, setCohorts] = useState(null);
  const [marketing, setMarketing] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!tenantId || !from || !to) return;
    setError("");
    try {
      const res = await fetch(`/api/reports?${new URLSearchParams({
        tenant_id: tenantId, report: "operational", date_from: from, date_to: to })}`,
        { credentials: "include" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(errorText(body, "The report could not be loaded."));
      setReport(body);
      const clientsRes = await fetch(`/api/reports?${new URLSearchParams({
        tenant_id: tenantId, report: "clients", as_of: to })}`,
        { credentials: "include" });
      const clientsBody = await clientsRes.json().catch(() => null);
      if (clientsRes.ok) setCohorts(clientsBody);
      const marketingRes = await fetch(`/api/reports?${new URLSearchParams({
        tenant_id: tenantId, report: "marketing", date_from: from, date_to: to })}`,
        { credentials: "include" });
      const marketingBody = await marketingRes.json().catch(() => null);
      if (marketingRes.ok) setMarketing(marketingBody);
    } catch (err) {
      setError(err.message || "The report could not be loaded.");
    }
  }, [tenantId, from, to]);

  useEffect(() => {
    if (router.isReady && router.query.tenant) setTenantId(String(router.query.tenant));
  }, [router.isReady, router.query.tenant]);

  return (
    <div style={{ minHeight: "100vh", background: "#f5f3ef", color: "#20231f", fontFamily: "Inter, system-ui, sans-serif" }}>
      <Head><title>Operational report — Salon Operations</title></Head>
      <main style={{ padding: "38px 5vw", maxWidth: 1080, margin: "0 auto" }}>
        <header style={{ marginBottom: 24 }}>
          <div style={muted}>Owner reports</div>
          <h1 style={{ margin: "6px 0", fontSize: 30 }}>Operational report</h1>
          <p style={muted}>Booked value is future work priced, never revenue. Recorded money is manually posted, never settled.</p>
        </header>

        <section style={panel}>
          <label style={{ display: "block", maxWidth: 420 }}>
            Tenant workspace
            <input style={input} value={tenantId} onChange={(e) => setTenantId(e.target.value.trim())}
              placeholder="Salon workspace UUID" />
          </label>
          <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label>From
              <input style={{ ...input, maxWidth: 160 }} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label>To
              <input style={{ ...input, maxWidth: 160 }} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
            <button type="button" style={button} onClick={load}>Load report</button>
          </div>
        </section>

        {error && <p role="alert" style={{ ...panel, color: "#8c2626" }}>{error}</p>}

        {report && (
          <>
            <section style={panel}>
              <h2 style={{ fontSize: 17, margin: "0 0 6px" }}>Bookings ({report.timezone})</h2>
              <p style={muted}>{report.bookings.total} total · completion {report.rates.completion_rate ?? "—"} · cancellation {report.rates.cancellation_rate ?? "—"} · no-show {report.rates.no_show_rate ?? "—"}</p>
              <ul style={{ margin: "12px 0 0", paddingLeft: 20 }}>
                {report.service_mix.map((row) => (
                  <li key={row.service}>{row.service}: {row.bookings} bookings, {money(row.booked_minor)} booked</li>
                ))}
                {report.service_mix.length === 0 && <li style={muted}>No bookings in range.</li>}
              </ul>
              <p style={muted}>Repeat clients {report.clients.repeat_clients} · new {report.clients.new_clients} · forecast booked {money(report.forecast_booked_value_minor)}</p>
            </section>

            <section style={panel}>
              <h2 style={{ fontSize: 17, margin: "0 0 6px" }}>Recorded receipts</h2>
              <p style={muted}>
                Gross {money(report.recorded_receipts.gross_minor)} · refunds {money(report.recorded_receipts.refunds_minor)} · adjustments {money(report.recorded_receipts.adjustments_minor)} · net {money(report.recorded_receipts.net_minor)}
              </p>
            </section>

            <section style={panel}>
              <h2 style={{ fontSize: 17, margin: "0 0 6px" }}>Definitions</h2>
              <p style={{ ...muted, whiteSpace: "pre-wrap" }}>{report.definitions.basis} Generated {report.generated_at}.</p>
            </section>

            {cohorts && (
              <section style={panel}>
                <h2 style={{ fontSize: 17, margin: "0 0 4px" }}>Client cohorts</h2>
                <ul style={{ margin: "12px 0", paddingLeft: 20, display: "grid", gap: 8 }}>
                  {cohorts.cohorts.map((cohort) => (
                    <li key={cohort.cohort}>
                      <strong>{cohort.cohort}</strong> — {cohort.clients} clients, {cohort.repeaters} repeaters
                      {cohort.avg_return_days != null && `, ${cohort.avg_return_days}d avg return`}
                      {cohort.immature && " (provisional)"}
                    </li>
                  ))}
                  {cohorts.cohorts.length === 0 && <li style={muted}>No cohorts yet.</li>}
                </ul>
                <p style={muted}>
                  Due cycles {cohorts.segments.due_cycles} · unreachable {cohorts.data_quality.clients_without_contacts} ·
                  open duplicates {cohorts.data_quality.open_duplicate_candidates}
                </p>
              </section>
            )}

            {marketing && (
              <section style={panel}>
                <h2 style={{ fontSize: 17, margin: "0 0 4px" }}>Marketing performance</h2>
                <ul style={{ margin: "12px 0", paddingLeft: 20, display: "grid", gap: 8 }}>
                  {marketing.delivery_by_channel_state.map((row, index) => (
                    <li key={index}>{row.channel} {row.state}: {row.count}</li>
                  ))}
                  {marketing.delivery_by_channel_state.length === 0 && <li style={muted}>Nothing sent in range.</li>}
                </ul>
                <p style={muted}>
                  Unknown delivery {marketing.unknown_delivery} · unsubscribes{" "}
                  {Object.values(marketing.unsubscribes_by_reason).reduce((a, b) => a + b, 0)} ·{" "}
                  prompt-attributed bookings {marketing.automation.prompt_attributed_bookings} ·{" "}
                  costs {marketing.message_costs.by_channel.map((c) => `${c.channel} ${c.minor}¢`).join(", ") || "none"}
                </p>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
