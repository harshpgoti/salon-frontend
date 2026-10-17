import {useWorkspace} from "../components/Workspace";
import {privatePage} from "../lib/session";
import { useCallback, useEffect, useRef, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { operationalReportCsv } from "../lib/operationalReportCsv";

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
  const {tenantId, setTenantId} = useWorkspace();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [report, setReport] = useState(null);
  const [cohorts, setCohorts] = useState(null);
  const [cohortsError, setCohortsError] = useState("");
  const [marketing, setMarketing] = useState(null);
  const [error, setError] = useState("");
  const [locationId, setLocationId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [stale, setStale] = useState(false);
  const latestRequest = useRef(0);

  useEffect(() => {
    latestRequest.current += 1;
    setReport(null); setCohorts(null); setCohortsError("");
    setMarketing(null); setError(""); setStale(false);
  }, [tenantId]);

  const load = useCallback(async () => {
    if (!tenantId || !from || !to) return;
    const requestId = ++latestRequest.current;
    setError("");
    setStale(Boolean(report));
    setCohorts(null);
    setCohortsError("");
    try {
      const filters = { tenant_id: tenantId, date_from: from, date_to: to,
        ...(locationId ? { location_id: locationId } : {}),
        ...(staffId ? { staff_id: staffId } : {}),
        ...(serviceId ? { service_id: serviceId } : {}) };
      const res = await fetch(`/api/reports?${new URLSearchParams({
        ...filters, report: "operational" })}`,
        { credentials: "include" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(errorText(body, "The report could not be loaded."));
      if (requestId !== latestRequest.current) return;
      setReport(body);
      setStale(false);
      try {
        const clientsRes = await fetch(`/api/reports?${new URLSearchParams({
          tenant_id: tenantId, report: "clients", as_of: to,
          ...(locationId ? { location_id: locationId } : {}) })}`,
          { credentials: "include" });
        const clientsBody = await clientsRes.json().catch(() => null);
        if (requestId === latestRequest.current) {
          if (clientsRes.ok) setCohorts(clientsBody);
          else setCohortsError(errorText(clientsBody, "Client insights are unavailable."));
        }
      } catch {
        if (requestId === latestRequest.current) {
          setCohortsError("Client insights are unavailable. Try loading the report again.");
        }
      }
      try {
        const marketingRes = await fetch(`/api/reports?${new URLSearchParams({
          tenant_id: tenantId, report: "marketing", date_from: from, date_to: to })}`,
          { credentials: "include" });
        const marketingBody = await marketingRes.json().catch(() => null);
        if (requestId === latestRequest.current && marketingRes.ok) setMarketing(marketingBody);
      } catch { /* The owner report remains current if an optional panel is unavailable. */ }
    } catch (err) {
      if (requestId === latestRequest.current) setError(err.message || "The report could not be loaded.");
    }
  }, [tenantId, from, to, locationId, staffId, serviceId, report]);

  function downloadCsv() {
    if (!report) return;
    const blob = new Blob([operationalReportCsv(report)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `salon-operational-report-${report.date_from}-${report.date_to}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }


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

          <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label>From
              <input style={{ ...input, maxWidth: 160 }} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label>To
              <input style={{ ...input, maxWidth: 160 }} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
            <label>Location ID (optional)
              <input style={{ ...input, maxWidth: 280 }} value={locationId} onChange={(e) => setLocationId(e.target.value.trim())} aria-label="Location ID filter" />
            </label>
            <label>Staff ID (optional)
              <input style={{ ...input, maxWidth: 280 }} value={staffId} onChange={(e) => setStaffId(e.target.value.trim())} aria-label="Staff ID filter" />
            </label>
            <label>Service ID (optional)
              <input style={{ ...input, maxWidth: 280 }} value={serviceId} onChange={(e) => setServiceId(e.target.value.trim())} aria-label="Service ID filter" />
            </label>
            <button type="button" style={button} onClick={load}>Load report</button>
            {report && <button type="button" style={{ ...button, background: "#52665a" }} onClick={downloadCsv}>Download CSV</button>}
          </div>
        </section>

        {error && <p role="alert" style={{ ...panel, color: "#8c2626" }}>{error}</p>}

        {report && (
          <>
            <p role="status" style={{ ...muted, marginTop: 0 }}>
              Report {report.date_from} to {report.date_to} ({report.timezone}), generated {report.generated_at}.
              {` ${report.metric_version} / ${report.currency}; timezone basis: ${report.timezone_basis}`}
              {stale && " Refresh failed or is running; this saved snapshot is stale."}
            </p>
            <section style={panel}>
              <h2 style={{ fontSize: 17, margin: "0 0 6px" }}>Bookings ({report.timezone})</h2>
              <p style={muted}>{report.bookings.total} total / completion {report.rates.completion_rate.value ?? "n/a"} ({report.rates.completion_rate.numerator}/{report.rates.completion_rate.denominator}) / cancellation {report.rates.cancellation_rate.value ?? "n/a"} ({report.rates.cancellation_rate.numerator}/{report.rates.cancellation_rate.denominator}) / no-show {report.rates.no_show_rate.value ?? "n/a"} ({report.rates.no_show_rate.numerator}/{report.rates.no_show_rate.denominator})</p>
              <ul style={{ margin: "12px 0 0", paddingLeft: 20 }}>
                {report.service_mix.map((row) => (
                  <li key={row.service_id}>{row.service}: {row.bookings} service lines, {money(row.booked_minor)} booked</li>
                ))}
                {report.service_mix.length === 0 && <li style={muted}>No bookings in range.</li>}
              </ul>
              <p style={muted}>Repeat clients {report.clients.repeat_clients} / new {report.clients.new_clients} / forecast booked {money(report.forecast_booked_value_minor)}</p>
              <p style={muted}>Forecast booked value is a price snapshot for future appointments, never revenue.</p>
            </section>

            <section style={panel}>
              <h2 style={{ fontSize: 17, margin: "0 0 6px" }}>Staff utilization</h2>
              <p style={muted}>{report.definitions.utilization}</p>
              {report.staff_utilization.length ? <ul style={{ margin: "12px 0 0", paddingLeft: 20 }}>
                {report.staff_utilization.map((row) => <li key={row.staff_id}>{row.staff_name}: {row.utilization == null ? "No available capacity" : `${(row.utilization * 100).toFixed(1)}%`} ({row.booked_minutes}/{row.scheduled_minutes} minutes)</li>)}
              </ul> : <p style={muted}>No staff bookings in this range.</p>}
            </section>

            <section style={panel}>
              <h2 style={{ fontSize: 17, margin: "0 0 6px" }}>Recorded receipts</h2>
              <p style={muted}>
                Gross {money(report.recorded_receipts.gross_minor)} / refunds {money(report.recorded_receipts.refunds_minor)} / adjustments {money(report.recorded_receipts.adjustments_minor)} / net {money(report.recorded_receipts.net_minor)}
              </p>
            </section>

            <section style={panel}>
              <h2 style={{ fontSize: 17, margin: "0 0 6px" }}>Definitions</h2>
              <p style={{ ...muted, whiteSpace: "pre-wrap" }}>{Object.entries(report.definitions).map(([key, value]) => `${key}: ${value}`).join("\n")} Generated {report.generated_at}.</p>
            </section>

            {cohortsError && <p role="alert" style={{ ...panel, color: "#8c2626" }}>{cohortsError}</p>}

            {cohorts && (
              <section style={panel}>
                <h2 style={{ fontSize: 17, margin: "0 0 4px" }}>Client cohorts and retention</h2>
                <p style={muted}>As of {cohorts.as_of} · generated {cohorts.generated_at} · {cohorts.timezone}. Visit dates use each appointment’s saved local timezone. Consent reachability and due-cycle counts reflect the current snapshot.</p>
                <p style={muted}>Reachable clients {cohorts.consent_reachability.reachable_clients}; due cycles {cohorts.segments.due_cycles}; inactive clients: 30d {cohorts.segments.inactive_30d}, 60d {cohorts.segments.inactive_60d}, 90d {cohorts.segments.inactive_90d}.</p>
                <h3 style={{ fontSize: 15 }}>Client visit history (up to {cohorts.consent_reachability.client_list_limit} clients)</h3>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                    <thead><tr>{["Client", "Source", "First visit", "Last visit", "Return interval", "Last service", "Next appointment", "Due", "Marketing"].map((label) => <th key={label} scope="col" style={{ padding: 8, borderBottom: "1px solid #d6d2ca" }}>{label}</th>)}</tr></thead>
                    <tbody>{cohorts.clients.map((row) => (
                      <tr key={row.client_id}>
                        <th scope="row" style={{ padding: 8, textAlign: "left" }}>{row.name}</th>
                        <td style={{ padding: 8 }}>{row.source}</td>
                        <td style={{ padding: 8 }}>{row.first_visit?.slice(0, 10) || "—"}</td>
                        <td style={{ padding: 8 }}>{row.last_visit?.slice(0, 10) || "—"}</td>
                        <td style={{ padding: 8 }}>{row.return_interval_days == null ? "—" : `${row.return_interval_days} days`}</td>
                        <td style={{ padding: 8 }}>{row.last_service || "—"}</td>
                        <td style={{ padding: 8 }}>{row.next_appointment?.slice(0, 16).replace("T", " ") || "—"}</td>
                        <td style={{ padding: 8 }}>{row.has_due_cycle ? "Due" : "—"}</td>
                        <td style={{ padding: 8 }}>{row.reachable ? "Reachable" : "Not reachable"}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
                <h3 style={{ fontSize: 15 }}>Data quality</h3>
                <ul style={{ margin: "8px 0", paddingLeft: 20 }}>
                  <li>Clients without contacts: {cohorts.data_quality.clients_without_contacts}</li>
                  <li>Clients without a primary contact: {cohorts.data_quality.clients_without_primary}</li>
                  <li>Unverified primary contacts: {cohorts.data_quality.unverified_primaries}</li>
                  <li>Open duplicate candidates: {cohorts.data_quality.open_duplicate_candidates}</li>
                  <li>Import error rows: {cohorts.data_quality.import_error_rows == null ? "Not available" : cohorts.data_quality.import_error_rows} ({cohorts.data_quality.import_error_scope})</li>
                </ul>
                <p style={muted}>Client source provenance: {Object.entries(cohorts.data_quality.clients_by_source).map(([source, count]) => `${source}: ${count}`).join(" · ") || "No clients"}.</p>
                <ul style={{ margin: "12px 0", paddingLeft: 20, display: "grid", gap: 8 }}>
                  {cohorts.cohorts.map((cohort) => (
                    <li key={cohort.cohort}>
                      <strong>{cohort.cohort}</strong> — {cohort.clients} clients, {cohort.repeaters} repeaters
                      {cohort.avg_return_days != null && `, ${cohort.avg_return_days}d avg return`}
                      {cohort.immature ? " (provisional; window still maturing)" : " (mature)"}
                    </li>
                  ))}
                  {cohorts.cohorts.length === 0 && <li style={muted}>No cohorts yet.</li>}
                </ul>
                <p style={muted}>
                  Import error totals are tenant-wide and shown only in all-location owner reports; they are omitted for location-scoped reports.
                </p>
              </section>
            )}

            {marketing && (
              <section style={panel}>
                <h2 style={{ fontSize: 17, margin: "0 0 4px" }}>Marketing performance</h2>
                <p role="status" style={muted}>
                  {marketing.freshness.source}; generated {marketing.freshness.generated_at}. {marketing.freshness.definition}
                </p>
                <h3 style={{ fontSize: 15 }}>Delivery by message</h3>
                <ul style={{ margin: "8px 0", paddingLeft: 20, display: "grid", gap: 6 }}>
                  {["accepted", "delivered", "read", "failed"].map((state) => (
                    <li key={state}>Provider {state}: {marketing.provider_events[state] || 0} distinct messages</li>
                  ))}
                  {marketing.delivery_by_channel_state.map((row, index) => (
                    <li key={`${row.channel}-${row.state}-${index}`}>{row.channel} outbox {row.state}: {row.count}</li>
                  ))}
                  <li>Unknown delivery: {marketing.unknown_delivery}; acceptance without delivery evidence is not counted as delivered.</li>
                </ul>
                <p style={muted}>A provider “read” status is not proof that a person opened or read an email.</p>
                <p style={muted}>Opt-outs by reason: {Object.entries(marketing.unsubscribes_by_reason).map(([reason, count]) => `${reason}: ${count}`).join(" · ") || "none"}. Consent records revoked in this period: {marketing.consents_revoked}.</p>
                <h3 style={{ fontSize: 15 }}>Campaign outcomes</h3>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                    <thead><tr>{["Campaign", "Channel", "Status", "Sent", "Skipped", "Attributed bookings", "Redemptions", "Provider actual", "Estimate", "Pending estimate"].map((label) => <th key={label} scope="col" style={{ padding: 8, borderBottom: "1px solid #d6d2ca" }}>{label}</th>)}</tr></thead>
                    <tbody>{marketing.campaigns.map((campaign) => (
                      <tr key={campaign.id}>
                        <th scope="row" style={{ padding: 8, textAlign: "left" }}>{campaign.name}</th>
                        <td style={{ padding: 8 }}>{campaign.channel}</td>
                        <td style={{ padding: 8 }}>{campaign.status}</td>
                        <td style={{ padding: 8 }}>{campaign.sent}</td>
                        <td style={{ padding: 8 }}>{campaign.skipped}</td>
                        <td style={{ padding: 8 }}>{campaign.attributed}</td>
                        <td style={{ padding: 8 }}>{campaign.redemptions}</td>
                        <td style={{ padding: 8 }}>{money(campaign.provider_actual_cost_minor)}</td>
                        <td style={{ padding: 8 }}>{money(campaign.estimated_cost_minor)}</td>
                        <td style={{ padding: 8 }}>{money(campaign.pending_estimate_minor)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
                {marketing.campaigns.length === 0 && <p style={muted}>No campaigns in this period.</p>}
                <h3 style={{ fontSize: 15 }}>Message cost reconciliation</h3>
                <ul style={{ margin: "8px 0", paddingLeft: 20, display: "grid", gap: 6 }}>
                  {marketing.message_costs.by_channel.map((cost) => (
                    <li key={cost.channel}>{cost.channel}: provider reconciled {money(cost.provider_actual_minor)}, application estimate {money(cost.estimated_minor)}, pending estimate {money(cost.pending_estimate_minor)} ({cost.messages} messages)</li>
                  ))}
                  {marketing.message_costs.by_channel.length === 0 && <li style={muted}>No message costs in this period.</li>}
                </ul>
                <p style={muted}>Amounts are CAD. Provider actuals come from matched usage lines; estimates and unresolved holds are shown separately. Attribution is descriptive, not causal. Opens are not used as campaign ROI.</p>
                <p style={muted}>Prompt-attributed bookings {marketing.automation.prompt_attributed_bookings} from {marketing.automation.rebooking_prompts_sent} prompts; descriptive only, not lift.</p>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export const getServerSideProps=privatePage("staff");
