import {useWorkspace} from "../components/Workspace";
import {privatePage} from "../lib/session";
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
  const {tenantId, setTenantId} = useWorkspace();
  const [items, setItems] = useState([]);
  const [rules, setRules] = useState([]);
  const [preview, setPreview] = useState(null);
  const [segments, setSegments] = useState([]);
  const [segmentName, setSegmentName] = useState("");
  const [segmentField, setSegmentField] = useState("tag");
  const [segmentValue, setSegmentValue] = useState("");
  const [segmentChannel, setSegmentChannel] = useState("sms");
  const [services, setServices] = useState([]);
  const [locations, setLocations] = useState([]);
  const [audience, setAudience] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [campaignNote, setCampaignNote] = useState("");
  const [campaignReport, setCampaignReport] = useState(null);
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
      const [serviceResult, locationResult] = await Promise.all([
        fetch(`/api/workspace?${new URLSearchParams({ tenant_id: tenantId, resource: "services" })}`, { credentials: "include" }).then(r => r.json()),
        fetch(`/api/workspace?${new URLSearchParams({ tenant_id: tenantId, resource: "locations" })}`, { credentials: "include" }).then(r => r.json()),
      ]);
      setServices(serviceResult.items || []);
      setLocations(locationResult.items || []);
      const rulesRes = await fetch(`/api/retention?${new URLSearchParams({ tenant_id: tenantId, resource: "rules" })}`,
        { credentials: "include" });
      const rulesBody = await rulesRes.json().catch(() => null);
      if (rulesRes.ok) setRules(rulesBody.items || []);
      const segmentsRes = await fetch(`/api/audience?${new URLSearchParams({ tenant_id: tenantId })}`,
        { credentials: "include" });
      const segmentsBody = await segmentsRes.json().catch(() => null);
      if (segmentsRes.ok) setSegments(segmentsBody.items || []);
      const campaignsRes = await fetch(`/api/campaigns?${new URLSearchParams({ tenant_id: tenantId })}`,
        { credentials: "include" });
      const campaignsBody = await campaignsRes.json().catch(() => null);
      if (campaignsRes.ok) setCampaigns(campaignsBody.items || []);
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

  const showAudience = (segmentId, channel = segmentChannel) => async () => {
    setError("");
    try {
      const res = await fetch(`/api/audience?${new URLSearchParams({ tenant_id: tenantId, segment_id: segmentId })}`,
        { method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channel }) });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(errorText(body, "Audience could not be computed."));
      setAudience(body);
    } catch (err) {
      setError(err.message || "Audience could not be computed.");
    }
  };

  const createSegment = async (event) => {
    event.preventDefault(); setError(""); setCampaignNote("");
    let value = segmentValue.trim();
    if (["min_spend_minor", "max_spend_minor", "inactive_days"].includes(segmentField)) {
      if (!/^\d+$/.test(value)) { setError("Enter a whole number for this filter."); return; }
      value = Number(value);
    }
    const definition = { [segmentField]: value };
    try {
      const res = await fetch(`/api/audience?${new URLSearchParams({ tenant_id: tenantId })}`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: segmentName.trim(), definition }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(errorText(body, "Segment could not be created."));
      setSegmentName(""); setSegmentValue("");
      await load();
      await showAudience(body.id, segmentChannel)();
    } catch (err) { setError(err.message || "Segment could not be created."); }
  };

  const campaignAction = (campaignId, action, payload) => async () => {
    setError(""); setCampaignNote("");
    try {
      const res = await fetch(`/api/campaigns?${new URLSearchParams({ tenant_id: tenantId, campaign_id: campaignId, action })}`,
        { method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload || {}) });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(errorText(body, "That campaign action failed."));
      setCampaignNote(action === "approve"
        ? `Approved: ${body.eligible} eligible, budget locked.`
        : action === "pause" ? "Paused: pending sends will wait until resumed."
          : action === "resume" ? "Resumed: approved sends will continue."
            : action === "cancel" ? "Cancelled: future sends stopped."
              : `Test recorded: ${body.communication_id}`);
      await load();
    } catch (err) {
      setError(err.message || "That campaign action failed.");
    }
  };

  const showReport = (campaignId) => async () => {
    setError("");
    try {
      const res = await fetch(`/api/campaigns?${new URLSearchParams({ tenant_id: tenantId, campaign_id: campaignId, action: "report" })}`,
        { credentials: "include" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(errorText(body, "Report could not be loaded."));
      setCampaignReport(body);
    } catch (err) {
      setError(err.message || "Report could not be loaded.");
    }
  };

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ minHeight: "100vh", background: "#f5f3ef", color: "#20231f", fontFamily: "Inter, system-ui, sans-serif" }}>
      <Head><title>Due for rebooking — Salon Operations</title></Head>
      <main style={{ padding: "38px 5vw", maxWidth: 1080, margin: "0 auto" }}>
        <header style={{ marginBottom: 24 }}>
          <div style={muted}>Client retention</div>
          <h1 style={{ margin: "6px 0", fontSize: 30 }}>Due for rebooking</h1>
          <p style={muted}>Completed services open a due date from the service interval or the client override.</p>
        </header>

        

        {error && <p role="alert" style={{ ...panel, color: "#8c2626" }}>{error}</p>}

        {!tenantId ? <p style={muted}>Select a salon from your account to continue.</p> : (
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

          <section style={panel}>
            <h2 style={{ fontSize: 17, margin: "0 0 4px" }}>Offer audiences</h2>
            <p style={{ ...muted, marginTop: 0 }}>
              Segments resolve to consenting, reachable clients only. Shared numbers never inflate the count.
            </p>
            <form onSubmit={createSegment} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, alignItems: "end" }}>
              <label style={muted}>Segment name<input aria-label="Segment name" required maxLength={120} value={segmentName} onChange={e => setSegmentName(e.target.value)} style={input} /></label>
              <label style={muted}>Include clients matching<select aria-label="Audience filter" value={segmentField} onChange={e => { setSegmentField(e.target.value); setSegmentValue(""); }} style={input}>
                <option value="tag">Client tag</option><option value="service">Completed service</option>
                <option value="location">Preferred location</option><option value="min_spend_minor">Minimum recorded spend (cents)</option>
                <option value="max_spend_minor">Maximum recorded spend (cents)</option><option value="inactive_days">No visit in this many days</option>
              </select></label>
              <label style={muted}>Filter value{segmentField === "service" ? (
                <select aria-label="Filter value" required value={segmentValue} onChange={e => setSegmentValue(e.target.value)} style={input}>
                  <option value="">Choose a service</option>{services.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              ) : segmentField === "location" ? (
                <select aria-label="Filter value" required value={segmentValue} onChange={e => setSegmentValue(e.target.value)} style={input}>
                  <option value="">Choose a location</option>{locations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              ) : <input aria-label="Filter value" required type={["min_spend_minor", "max_spend_minor", "inactive_days"].includes(segmentField) ? "number" : "text"}
                min={segmentField === "inactive_days" ? 1 : 0} max={segmentField === "inactive_days" ? 3650 : undefined}
                value={segmentValue} onChange={e => setSegmentValue(e.target.value)} style={input} />}</label>
              <label style={muted}>Preview channel<select aria-label="Preview channel" value={segmentChannel} onChange={e => setSegmentChannel(e.target.value)} style={input}>
                <option value="sms">SMS</option><option value="email">Email</option><option value="whatsapp">WhatsApp</option>
              </select></label>
              <button type="submit" style={button} disabled={busy || !tenantId}>Create and preview</button>
            </form>
            {segments.length === 0 && <p style={muted}>No segments yet.</p>}
            <ul style={{ margin: "12px 0", paddingLeft: 20, display: "grid", gap: 10 }}>
              {segments.map((segment) => (
                <li key={segment.id}>
                  <strong>{segment.name}</strong>{" "}
                  <button type="button" style={button} disabled={busy} onClick={showAudience(segment.id, segmentChannel)}>
                    Preview {segmentChannel.toUpperCase()} audience
                  </button>
                </li>
              ))}
            </ul>
            {audience && (
              <p role="status" style={{ ...muted, marginTop: 8 }}>
                {audience.candidates} candidates: {audience.eligible_count} eligible across{" "}
                {audience.reachable_numbers} numbers
                ({audience.shared_numbers} shared) —{" "}
                {audience.exclusions.no_consent} no consent, {audience.exclusions.suppressed} suppressed,{" "}
                {audience.exclusions.unreachable} unreachable.
              </p>
            )}
          </section>

          <section style={panel}>
            <h2 style={{ fontSize: 17, margin: "0 0 4px" }}>Offer campaigns</h2>
            <p style={{ ...muted, marginTop: 0 }}>
              Approval locks the audience, content, budget and schedule. Pause or cancel stops pending sends; opt-outs and budgets are checked again at send time.
            </p>
            {campaignNote && <p role="status" style={{ color: "#2c3f31" }}>{campaignNote}</p>}
            {campaigns.length === 0 && <p style={muted}>No campaigns yet.</p>}
            <ul style={{ margin: "12px 0", paddingLeft: 20, display: "grid", gap: 10 }}>
              {campaigns.map((campaign) => (
                <li key={campaign.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <span><strong>{campaign.name}</strong> — {campaign.channel} · {campaign.status} · sent {campaign.sent}, pending {campaign.pending}, skipped {campaign.skipped}</span>
                  <span style={{ display: "flex", gap: 8 }}>
                    {campaign.status === "draft" && (
                      <button type="button" style={button} disabled={busy} onClick={campaignAction(campaign.id, "approve")}>Approve</button>
                    )}
                    {(campaign.status === "scheduled" || campaign.status === "sending"
                      || (["completed", "partial"].includes(campaign.status) && campaign.pending > 0)) && (
                      <button type="button" style={button} disabled={busy} onClick={campaignAction(campaign.id, "pause")}>Pause</button>
                    )}
                    {campaign.status === "paused" && (
                      <button type="button" style={button} disabled={busy} onClick={campaignAction(campaign.id, "resume")}>Resume</button>
                    )}
                    {(["scheduled", "sending", "paused"].includes(campaign.status)
                      || (["completed", "partial"].includes(campaign.status) && campaign.pending > 0)) && (
                      <button type="button" style={{ ...button, background: "#8c2626" }} disabled={busy} onClick={campaignAction(campaign.id, "cancel")}>Cancel</button>
                    )}
                    <button type="button" style={button} disabled={busy} onClick={showReport(campaign.id)}>Report</button>
                  </span>
                </li>
              ))}
            </ul>
            {campaignReport && (
              <p role="status" style={{ ...muted, marginTop: 8 }}>
                {campaignReport.name}: {campaignReport.attributed_count} attributed bookings,{" "}
                ${(campaignReport.attributed_recorded_minor / 100).toFixed(2)} recorded,{" "}
                {campaignReport.unsubscribes_since_approval} unsubscribes since approval.
              </p>
            )}
          </section>
          </>
        )}
      </main>
    </div>
  );
}

export const getServerSideProps=privatePage("staff");
