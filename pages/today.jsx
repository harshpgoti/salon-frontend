import {useWorkspace} from "../components/Workspace";
import {privatePage} from "../lib/session";
import { useCallback, useEffect, useRef, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";

const panel = { background: "#ffffff", border: "1px solid #e8e6df", borderRadius: 14, padding: 20, marginBottom: 18 };
const muted = { color: "#747970", fontSize: 13 };
const input = { display: "block", width: "100%", boxSizing: "border-box", marginTop: 6, padding: 10, border: "1px solid #c9c6bd", borderRadius: 7 };

function errorText(payload, fallback) {
  const detail = payload?.detail;
  if (typeof detail === "string") return detail;
  if (detail?.code) return detail.code.replace(/_/g, " ");
  return fallback;
}

// Today dashboard (TASK-041): the front desk's actionable work for a date — appointments
// by state, pending approvals, closures, who is on shift, and delivery follow-ups.
export default function Today() {
  const router = useRouter();
  const {tenantId, setTenantId} = useWorkspace();
  const [report, setReport] = useState(null);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setError("");
    if (!tenantId) { setBusy(false); return; }
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/today?${new URLSearchParams({ tenant_id: tenantId })}`,
        { credentials: "include" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(errorText(body, "Today could not be loaded."));
      if (requestId.current === currentRequest) { setReport(body); setStale(false); }
    } catch (err) {
      if (requestId.current === currentRequest) {
        setStale(true);
        setError(err.message || "Today could not be loaded.");
      }
    } finally { if (requestId.current === currentRequest) setBusy(false); }
  }, [tenantId]);

  useEffect(() => {
    setReport(null);
    setStale(false);
    setError("");
    load();
    return () => { requestId.current += 1; };
  }, [load]);

  const counts = report?.counts_by_state || {};
  const tasks = report?.delivery_tasks || {};

  return (
    <div style={{ minHeight: "100vh", background: "#f5f3ef", color: "#20231f", fontFamily: "Inter, system-ui, sans-serif" }}>
      <Head><title>Today — Salon Operations</title></Head>
      <main style={{ padding: "38px 5vw", maxWidth: 1080, margin: "0 auto" }}>
        <header style={{ marginBottom: 24 }}>
          <div style={muted}>Front desk</div>
          <h1 style={{ margin: "6px 0", fontSize: 30 }}>Today{report ? ` — ${report.date}` : ""}</h1>
          <p role="status" style={muted}>
            {report ? `Updated ${new Date(report.generated_at).toLocaleTimeString()}.` : "Your actionable work for the day."}
          </p>        </header>

        {tenantId && <button type="button" className="button secondary" disabled={busy}
          onClick={() => { setStale(Boolean(report)); load(); }}>{busy ? "Loading…" : "Refresh Today"}</button>}
        {stale && report && <p role="status" style={{ ...muted, color: "#8c5a18" }}>
          Showing a saved snapshot from {new Date(report.generated_at).toLocaleTimeString()}; refresh to retry.
        </p>}
        {busy && <p role="status" style={muted}>Loading the latest salon report…</p>}

        

        {error && <p role="alert" style={{ ...panel, color: "#8c2626" }}>{error}</p>}

        {!tenantId ? <p style={muted}>Select a salon from your account to continue.</p> : report && (
          <>
            <section style={panel}>
              <h2 style={{ fontSize: 17, margin: "0 0 6px" }}>Appointments</h2>
              {report.appointments.length === 0 ? <p style={muted}>Nothing booked.</p> : (
                <>
                  <p style={muted}>
                    {Object.entries(counts).map(([state, n]) => `${n} ${state.replace(/_/g, " ")}`).join(" · ")}
                  </p>
                  <ul style={{ margin: "12px 0 0", paddingLeft: 20, display: "grid", gap: 8 }}>
                    {report.appointments.map((appt) => (
                      <li key={appt.id}>
                        <strong>{appt.client_name}</strong> — {appt.service_name} with {appt.staff_id.slice(0, 8)}
                        {" · "}{new Date(appt.starts_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone: appt.local_timezone })}
                        {" · "}{appt.status.replace(/_/g, " ")}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>

            <section style={panel}>
              <h2 style={{ fontSize: 17, margin: "0 0 6px" }}>Needs attention</h2>
              <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 8 }}>
                <li>Pending approvals: {report.pending_approvals.length}</li>
                <li>Active closure impacts: {report.active_closure_impacts.length}</li>
                <li>Failed messages: {tasks.failed_communications ?? 0}</li>
                <li>Open dead letters: {tasks.open_dead_letters ?? 0}</li>
                <li>Open follow-up tasks: {tasks.open_follow_up_tasks ?? 0}</li>
                <li>On shift: {(report.staff_on_shift || []).length} ({(report.staff_on_leave || []).length} on leave)</li>
              </ul>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

export const getServerSideProps=privatePage("staff");
