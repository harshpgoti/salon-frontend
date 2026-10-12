import { useCallback, useEffect, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";

const panel = { background: "#ffffff", border: "1px solid #e8e6df", borderRadius: 14, padding: 20, marginBottom: 18 };
const muted = { color: "#747970", fontSize: 13 };
const input = { display: "block", width: "100%", boxSizing: "border-box", marginTop: 6, padding: 10, border: "1px solid #c9c6bd", borderRadius: 7 };
const button = { padding: "10px 16px", background: "#334b39", color: "#fff", border: 0, borderRadius: 8, cursor: "pointer" };
const STEP_LABEL = {
  business_identity: "Business identity", location: "Location, time zone and currency",
  hours: "Opening hours", service: "Services", qualified_staff: "Qualified staff",
  public_link: "Publish booking link", communication_setup: "Communication setup", import: "Import existing data",
};
const STATE_LABEL = { complete: "Done", pending: "To do" };

function errorText(payload, fallback) {
  const detail = payload?.detail;
  if (typeof detail === "string") return detail;
  if (detail?.code) return detail.code.replace(/_/g, " ");
  return fallback;
}

// Salon billing (TASK-046): plan, trial state, hosted checkout and invoices. The page
// only displays what the API reports; plan changes activate through provider webhooks,
// never from this browser.
function Billing({ tenantId }) {
  const [plans, setPlans] = useState([]);
  const [subscription, setSubscription] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState("");
  const [working, setWorking] = useState(false);

  const call = useCallback(async (resource, options = {}) => {
    const res = await fetch(`/api/billing/${resource}?${new URLSearchParams({ tenant_id: tenantId, ...(options.query || {}) })}`,
      { credentials: "include", ...(options.fetch || {}) });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(errorText(body, "Billing is unavailable right now."));
    return body;
  }, [tenantId]);

  const load = useCallback(async () => {
    if (!tenantId) return;
    try {
      const [plansBody, subBody, invoicesBody] = await Promise.all([
        call("plans"), call("subscription"), call("invoices"),
      ]);
      setPlans(plansBody.items || []);
      setSubscription(subBody);
      setInvoices(invoicesBody.items || []);
    } catch (err) {
      setProblem(err.message || "Billing is unavailable right now.");
    }
  }, [tenantId, call]);

  useEffect(() => { load(); }, [load]);

  const checkout = (planCode) => async () => {
    setWorking(true); setProblem(""); setNote("");
    try {
      const body = await call("checkout",
        { fetch: { method: "POST", headers: { "Content-Type": "application/json" },
                   body: JSON.stringify({ plan_code: planCode }) } });
      setNote(`Checkout opened. Complete payment in the hosted page; your plan activates automatically afterwards. ${body.checkout_url}`);
    } catch (err) {
      setProblem(err.message || "Checkout could not start.");
    } finally { setWorking(false); }
  };

  const portal = async () => {
    setWorking(true); setProblem(""); setNote("");
    try {
      const body = await call("portal", { fetch: { method: "POST" } });
      setNote(`Manage payment in the hosted portal: ${body.url}`);
    } catch (err) {
      setProblem(err.message || "The portal could not open.");
    } finally { setWorking(false); }
  };

  const money = (minor) => `$${(minor / 100).toFixed(2)}`;

  return (
    <section style={panel}>
      <h2 style={{ fontSize: 17, margin: "0 0 4px" }}>Billing</h2>
      <p style={{ ...muted, marginTop: 0 }}>
        {subscription
          ? `Current plan: ${subscription.plan_name} (${subscription.status}).`
          : "Loading subscription…"}
      </p>
      {problem && <p role="alert" style={{ color: "#8c2626" }}>{problem}</p>}
      {note && <p role="status" style={{ color: "#2c3f31", wordBreak: "break-all" }}>{note}</p>}
      <ul style={{ margin: "12px 0", paddingLeft: 20, display: "grid", gap: 10 }}>
        {plans.map((plan) => (
          <li key={plan.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <span><strong>{plan.name}</strong> — {money(plan.price_minor)} CAD/mo · up to {plan.limits.max_locations} location(s), {plan.limits.max_staff} staff</span>
            <button type="button" style={button} disabled={working} onClick={checkout(plan.code)}>
              Choose {plan.name}
            </button>
          </li>
        ))}
      </ul>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" style={button} disabled={working} onClick={portal}>Manage payment</button>
      </div>
      {invoices.length > 0 && (
        <ul style={{ margin: "12px 0 0", paddingLeft: 20 }}>
          {invoices.map((invoice) => (
            <li key={invoice.id}>{invoice.plan} — {money(invoice.amount_minor)} {invoice.currency} ({invoice.status})</li>
          ))}
        </ul>
      )}
    </section>
  );
}

// SMS sender setup (TASK-029): list the salon's sender identities, register a new one,
// and verify it with the code the API returns. Verification state comes from the API;
// this page never invents it.
function SmsSenders({ tenantId }) {
  const [senders, setSenders] = useState([]);
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState("");
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId) return;
    try {
      const res = await fetch(`/api/senders?${new URLSearchParams({ tenant_id: tenantId })}`,
        { credentials: "include" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(errorText(body, "Senders could not be loaded."));
      setSenders(body.items || []);
    } catch (err) {
      setProblem(err.message || "Senders could not be loaded.");
    }
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  async function post(query, payload, okMessage) {
    setWorking(true); setProblem(""); setNote("");
    try {
      const res = await fetch(`/api/senders?${new URLSearchParams({ tenant_id: tenantId, ...query })}`,
        { method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload || {}) });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(errorText(body, "That change could not be saved."));
      setNote(okMessage);
      await load();
      return body;
    } catch (err) {
      setProblem(err.message || "That change could not be saved.");
      return null;
    } finally { setWorking(false); }
  }

  const register = (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    post({}, { label: String(form.get("label") || ""), sender_identity: String(form.get("sender_identity") || "") },
      "Sender registered. Enter the verification code below to activate it.").then(() => event.currentTarget.reset());
  };
  const verify = (senderId) => (event) => {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code") || "");
    post({ sender_id: senderId, action: "verify" }, { code }, "Sender verified. SMS reminders can now use it.");
  };
  const suspend = (senderId) => () => {
    post({ sender_id: senderId, action: "suspend" }, {}, "Sender suspended. It will no longer send SMS.");
  };

  return (
    <section style={panel}>
      <h2 style={{ fontSize: 17, margin: "0 0 4px" }}>SMS senders</h2>
      <p style={{ ...muted, marginTop: 0 }}>
        Reminders go out under your own verified number only. Unverified numbers never send.
      </p>
      {problem && <p role="alert" style={{ color: "#8c2626" }}>{problem}</p>}
      {note && <p role="status" style={{ color: "#2c3f31" }}>{note}</p>}
      <ul style={{ margin: "12px 0", paddingLeft: 20, display: "grid", gap: 10 }}>
        {senders.map((sender) => (
          <li key={sender.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <span><strong>{sender.label}</strong> {sender.sender_identity} — {sender.status}</span>
            <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {sender.status === "pending" && (
                <form onSubmit={verify(sender.id)} style={{ display: "flex", gap: 8 }}>
                  <input name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required
                    placeholder="6-digit code" aria-label={`Verification code for ${sender.label}`}
                    style={{ ...input, marginTop: 0, maxWidth: 140 }} />
                  <button type="submit" style={button} disabled={working}>Verify</button>
                </form>
              )}
              {sender.status === "verified" && (
                <button type="button" style={{ ...button, background: "#8c2626" }}
                  disabled={working} onClick={suspend(sender.id)}>Suspend</button>
              )}
            </span>
          </li>
        ))}
        {senders.length === 0 && <li style={muted}>No senders yet. Register your salon number below.</li>}
      </ul>
      <form onSubmit={register} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label>Label
          <input style={{ ...input, maxWidth: 200 }} name="label" maxLength={80} required placeholder="Front desk" />
        </label>
        <label>Sender number
          <input style={{ ...input, maxWidth: 200 }} name="sender_identity" required placeholder="+14165550132" />
        </label>
        <button type="submit" style={button} disabled={working}>Register sender</button>
      </form>
    </section>
  );
}

// Like the team page, the tenant id here only selects which salon to load. Every
// authorization decision is made by the API from the session cookie.
export default function Settings() {
  const router = useRouter();
  const [tenantId, setTenantId] = useState("");
  const [steps, setSteps] = useState([]);
  const [readiness, setReadiness] = useState(null);
  const [settings, setSettings] = useState({});
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [version, setVersion] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const url = useCallback(
    (resource, params = {}) => `/api/settings?${new URLSearchParams({ tenant_id: tenantId, resource, ...params })}`,
    [tenantId],
  );

  const load = useCallback(async () => {
    if (!tenantId) return;
    setBusy(true); setError("");
    try {
      const [setupRes, settingsRes] = await Promise.all([
        fetch(url("setup"), { credentials: "include" }),
        fetch(url("settings"), { credentials: "include" }),
      ]);
      if (!setupRes.ok) {
        setError(errorText(await setupRes.json().catch(() => null), "Setup progress could not be loaded."));
        return;
      }
      const setup = await setupRes.json();
      setSteps(setup.steps || []);
      setReadiness({ accepting: setup.accepting_bookings, missing: setup.missing_setup || [] });
      if (settingsRes.ok) {
        const body = await settingsRes.json();
        setSettings(body.settings || {});
        setVersion(body.settings_version || 0);
        setSettingsLoaded(true);
      } else {
        // Keep the branding form disabled. An emptied box now means "clear this", so
        // saving against a failed load would erase every stored value.
        setSettingsLoaded(false);
        setError(errorText(await settingsRes.json().catch(() => null), "Salon settings could not be loaded."));
      }
    } catch {
      setError("The settings service is unavailable.");
    } finally { setBusy(false); }
  }, [tenantId, url]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    // Onboarding links here with the tenant it just created.
    if (router.isReady && router.query.tenant) setTenantId(String(router.query.tenant));
  }, [router.isReady, router.query.tenant]);

  async function save(path, body, okMessage, onDone) {
    setBusy(true); setError(""); setStatus("");
    try {
      const response = await fetch(url(...path), {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorText(payload, "That change could not be saved."));
      if (onDone) onDone(payload);
      setStatus(okMessage);
      await load();
    } catch (err) {
      setError(err.message || "That change could not be saved.");
    } finally { setBusy(false); }
  }

  const markStep = (step, state) =>
    save(["setup", { step }], { state }, `${STEP_LABEL[step] || step} marked as done.`);
  const saveBranding = (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    // An emptied field is sent as an explicit null so the API clears it. Sending
    // `undefined` instead would drop the key, and the owner would be told their change
    // saved while the old value stayed.
    const field = (name) => {
      const value = form.get(name);
      return value === null || value === "" ? null : value;
    };
    save(["settings"], {
      brand_name: field("brand_name"),
      primary_colour: field("primary_colour"),
      accent_colour: field("accent_colour"),
      cancellation_policy: field("cancellation_policy"),
      notification_language: field("notification_language"),
    }, "Salon settings saved.");
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f5f3ef", color: "#20231f", fontFamily: "Inter, system-ui, sans-serif" }}>
      <Head><title>Setup &amp; branding · Salon Operations</title></Head>
      <main style={{ padding: "38px 5vw", maxWidth: 1080, margin: "0 auto" }}>
        <header style={{ marginBottom: 24 }}>
          <div style={muted}>Guided setup</div>
          <h1 style={{ margin: "6px 0", fontSize: 30 }}>Finish setting up your salon</h1>
          <p style={muted}>Work through the list, then publish your booking link. Your progress is saved as you go.</p>
        </header>

        <section style={panel}>
          <label style={{ display: "block", maxWidth: 420 }}>
            Tenant workspace
            <input style={input} value={tenantId} onChange={(e) => setTenantId(e.target.value.trim())}
              placeholder="Salon workspace UUID" aria-describedby="tenant-help" />
          </label>
          <small id="tenant-help" style={{ ...muted, display: "block", marginTop: 8 }}>
            Your session decides what you can see. This id only selects which salon the page loads.
          </small>
        </section>

        {error && <p role="alert" style={{ ...panel, color: "#8c2626" }}>{error}</p>}
        <p role="status" aria-live="polite" style={{ ...panel, color: "#2c3f31", display: status ? "block" : "none" }}>{status}</p>

        {!tenantId ? <p style={muted}>Enter your workspace id to continue setup.</p> : (
          <>
            <section style={panel}>
              <h2 style={{ fontSize: 17, margin: "0 0 6px" }}>Setup checklist</h2>
              <p style={{ ...muted, marginTop: 0 }}>
                {readiness?.accepting
                  ? "Your booking page is open and accepting bookings."
                  : `Your booking page is not accepting bookings yet. Still to do: ${(readiness?.missing || []).map((s) => STEP_LABEL[s] || s).join(", ")}.`}
              </p>
              <ol style={{ margin: "14px 0 0", paddingLeft: 20, display: "grid", gap: 8 }}>
                {steps.map((item) => (
                  <li key={item.step} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                    <span>{STEP_LABEL[item.step] || item.step}</span>
                    {item.state === "complete"
                      ? <span style={{ color: "#2c6b3f" }}>{STATE_LABEL[item.state]}</span>
                      : item.stored
                        ? <button type="button" style={button} disabled={busy} onClick={() => markStep(item.step, "complete")}>
                            {busy ? "Working…" : "Mark as done"}
                          </button>
                        : <span style={muted}>Added automatically when set up</span>}
                  </li>
                ))}
              </ol>
            </section>

            <section style={panel}>
              <h2 style={{ fontSize: 17, margin: "0 0 4px" }}>Branding and preferences</h2>
              <p style={{ ...muted, marginTop: 0 }}>
                Shown on your public booking page. Version {version} — saved changes always advance it.
                {!settingsLoaded && " Reconnect before editing: saving now would clear the stored values."}
              </p>
              <form onSubmit={saveBranding} style={{ display: "grid", gap: 14, marginTop: 14 }}>
                <label style={{ maxWidth: 420 }}>Public brand name
                  <input style={input} name="brand_name" maxLength={120} disabled={!settingsLoaded}
                    defaultValue={settings.brand_name || ""} placeholder="Maple & Co" />
                </label>
                <label style={{ maxWidth: 260 }}>Primary colour
                  <input style={input} name="primary_colour" maxLength={7} pattern="#[0-9a-fA-F]{6}"
                    disabled={!settingsLoaded} defaultValue={settings.primary_colour || ""} placeholder="#334b39" />
                </label>
                <label style={{ maxWidth: 260 }}>Accent colour
                  <input style={input} name="accent_colour" maxLength={7} pattern="#[0-9a-fA-F]{6}"
                    disabled={!settingsLoaded} defaultValue={settings.accent_colour || ""} placeholder="#8c2626" />
                </label>
                <label style={{ maxWidth: 260 }}>Notification language
                  <select style={input} name="notification_language" disabled={!settingsLoaded}
                    defaultValue={settings.notification_language || ""}>
                    <option value="">Not chosen</option>
                    <option value="en-CA">English (Canada)</option>
                    <option value="fr-CA">Français (Canada)</option>
                  </select>
                </label>
                <label style={{ maxWidth: 620 }}>Cancellation terms
                  <textarea style={{ ...input, minHeight: 84 }} name="cancellation_policy" maxLength={2000}
                    disabled={!settingsLoaded} defaultValue={settings.cancellation_policy || ""}
                    placeholder="Free cancellation up to 24 hours before the appointment." />
                </label>
                <div><button type="submit" style={button} disabled={busy || !settingsLoaded}>{busy ? "Saving…" : "Save settings"}</button></div>
              </form>
            </section>

            <SmsSenders tenantId={tenantId} />

            <Billing tenantId={tenantId} />

            <p><a href="/team">Manage your team →</a></p>
          </>
        )}
      </main>
    </div>
  );
}