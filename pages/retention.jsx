import { useCallback, useEffect, useState } from "react";
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

// Due-service list (TASK-035): every completed service opens a deterministic due cycle.
// Staff rebook from here; prompts and snooze arrive with TASK-037.
export default function Retention() {
  const router = useRouter();
  const [tenantId, setTenantId] = useState("");
  const [items, setItems] = useState([]);
  const [rules, setRules] = useState([]);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/retention?${new URLSearchParams({ tenant_id: tenantId })}`,
        { credentials: "include" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(errorText(body, "Due cycles could not be loaded."));
      setItems(body.items || []);
      const rulesRes = await fetch(`/api/retention?${new URLSearchParams({ tenant_id: tenantId, resource: "rules" })}`,
        { credentials: "include" });
      const rulesBody = await rulesRes.json().catch(() => null);
      if (rulesRes.ok) setRules(rulesBody.items || []);
    } catch (err) {
      setError(err.message || "Due cycles could not be loaded.");
    } finally { setBusy(false); }
  }, [tenantId]);

  const showPreview = (ruleId) => async () => {
    setError("");
    try {
      const res = await fetch(`/api/retention?${new URLSearchParams({ tenant_id: tenantId, resource: "preview", rule_id: ruleId })}`,
        { method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" }, body: "{}" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(errorText(body, "Preview could not be computed."));
      setPreview(body);
    } catch (err) {
      setError(err.message || "Preview could not be computed.");
    }
  };

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (router.isReady && router.query.tenant) setTenantId(String(router.query.tenant));
  }, [router.isReady, router.query.tenant]);

  return (
    <div style={{ minHeight: "100vh", background: "#f5f3ef", color: "#20231f", fontFamily: "Inter, system-ui, sans-serif" }}>
      <Head><title>Due for rebooking — Salon Operations</title></Head>
      <main style={{ padding: "38px 5vw", maxWidth: 1080, margin: "0 auto" }}>
        <header style={{ marginBottom: 24 }}>
          <div style={muted}>Client retention</div>
          <h1 style={{ margin: "6px 0", fontSize: 30 }}>Due for rebooking</h1>
          <p style={muted}>Completed services open a due date from the service interval or the client override.</p>
        </header>

        <section style={panel}>
          <label style={{ display: "block", maxWidth: 420 }}>
            Tenant workspace
            <input style={input} value={tenantId} onChange={(e) => setTenantId(e.target.value.trim())}
              placeholder="Salon workspace UUID" />
          </label>
        </section>

        {error && <p role="alert" style={{ ...panel, color: "#8c2626" }}>{error}</p>}

        {!tenantId ? <p style={muted}>Enter your workspace id to load due cycles.</p> : (
          <>
          <section style={panel}>
            {items.length === 0 && <p style={muted}>{busy ? "Loading…" : "Nothing due."}</p>}
            <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 10 }}>
              {items.map((item) => (
                <li key={item.id}>
                  <strong>{item.client_name}</strong> — {item.service_name}
                  {" · due "}{item.due_date}{" · every "}{item.interval_days} days
                </li>
              ))}
            </ul>
          </section>

          <section style={panel}>
            <h2 style={{ fontSize: 17, margin: "0 0 4px" }}>Rebooking rules</h2>
            <p style={{ ...muted, marginTop: 0 }}>
              One rule per service. Preview shows who would be reached and what it would cost before anything sends.
            </p>
            {rules.length === 0 && <p style={muted}>No rules yet.</p>}
            <ul style={{ margin: "12px 0", paddingLeft: 20, display: "grid", gap: 10 }}>
              {rules.map((rule) => (
                <li key={rule.id}>
                  <strong>{rule.service_name}</strong> — every {rule.interval_days} days via {rule.channel}
                  {rule.is_active ? " · active" : " · draft"}{" "}
                  <button type="button" style={button} disabled={busy} onClick={showPreview(rule.id)}>
                    Preview
                  </button>
                </li>
              ))}
            </ul>
            {preview && (
              <p role="status" style={{ ...muted, marginTop: 8 }}>
                Due {preview.due_total}: {preview.eligible} eligible, {preview.suppressed} suppressed,{" "}
                {preview.unreachable} unreachable — about {preview.estimated_sends} sends
                ({preview.estimated_cost_minor}¢ {preview.currency}).
              </p>
            )}
          </section>
          </>
        )}
      </main>
    </div>
  );
}
