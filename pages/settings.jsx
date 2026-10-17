import {useWorkspace} from "../components/Workspace";
import {privatePage} from "../lib/session";
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

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const localDateValue = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

function LocationHours({ tenantId, locations }) {
  const [locationId, setLocationId] = useState("");
  const [location, setLocation] = useState(null);
  const [intervals, setIntervals] = useState([]);
  const [effectiveFrom, setEffectiveFrom] = useState(localDateValue);
  const [exceptions, setExceptions] = useState([]);
  const [exceptionForm, setExceptionForm] = useState({ exception_date: "", kind: "closed", opens_at: "10:00", closes_at: "15:00", label: "" });
  const [problem, setProblem] = useState("");
  const [note, setNote] = useState("");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!locations.some((item) => item.id === locationId)) setLocationId(locations[0]?.id || "");
  }, [locations, locationId]);

  const url = useCallback((resource, extra = {}) => `/api/settings?${new URLSearchParams({
    tenant_id: tenantId, resource, location_id: locationId, ...extra,
  })}`, [tenantId, locationId]);

  const load = useCallback(async () => {
    if (!tenantId || !locationId) return;
    setProblem("");
    try {
      const [hoursRes, exceptionsRes, publicRes] = await Promise.all([
        fetch(url("location-hours"), { credentials: "include" }),
        fetch(url("location-exceptions"), { credentials: "include" }),
        fetch(url("public-hours"), { credentials: "include" }),
      ]);
      const [hours, exceptionBody, publicHours] = await Promise.all([
        hoursRes.json().catch(() => null), exceptionsRes.json().catch(() => null), publicRes.json().catch(() => null),
      ]);
      if (!hoursRes.ok) throw new Error(errorText(hours, "Opening hours could not be loaded."));
      if (!exceptionsRes.ok) throw new Error(errorText(exceptionBody, "Holiday exceptions could not be loaded."));
      if (!publicRes.ok) throw new Error(errorText(publicHours, "Public hours preview could not be loaded."));
      const locationBody = locations.find((item) => item.id === locationId) || null;
      setLocation(locationBody);
      const current = hours.items || [];
      setIntervals(current.map(({ weekday, opens_at, closes_at }) => ({ weekday, opens_at, closes_at })));
      if (current[0]?.effective_from) setEffectiveFrom(current[0].effective_from);
      setExceptions(exceptionBody.items || []);
    } catch (err) { setProblem(err.message || "Opening hours are unavailable."); }
  }, [tenantId, locationId, locations, url]);

  useEffect(() => { load(); }, [load]);

  async function request(resource, method, body, extra = {}) {
    const response = await fetch(url(resource, extra), {
      method, credentials: "include",
      ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(errorText(payload, "That hours change could not be saved."));
    return payload;
  }

  async function act(action) {
    setWorking(true); setProblem(""); setNote("");
    try { await action(); await load(); }
    catch (err) { setProblem(err.message || "That hours change could not be saved."); }
    finally { setWorking(false); }
  }

  function updateInterval(index, key, value) {
    setIntervals((current) => current.map((item, at) => at === index ? { ...item, [key]: key === "weekday" ? Number(value) : value } : item));
  }

  async function publishHours(event) {
    event.preventDefault();
    await act(async () => {
      const payload = await request("location-hours", "PUT", { effective_from: effectiveFrom, intervals });
      setIntervals((payload.intervals || []).map(({ weekday, opens_at, closes_at }) => ({ weekday, opens_at, closes_at })));
      setNote(`Weekly hours published for ${effectiveFrom}.`);
    });
  }

  async function createException(event) {
    event.preventDefault();
    await act(async () => {
      await request("location-exceptions", "POST", {
        exception_date: exceptionForm.exception_date, kind: exceptionForm.kind,
        ...(exceptionForm.kind === "custom" ? { opens_at: exceptionForm.opens_at, closes_at: exceptionForm.closes_at } : {}),
        label: exceptionForm.label || null,
      });
      setExceptionForm((current) => ({ ...current, exception_date: "", label: "" }));
      setNote("Holiday exception saved. Publish it below when it is ready for clients.");
    });
  }

  async function publishException(item, published) {
    await act(async () => {
      await request("exception-publish", "POST", { published }, { exception_id: item.id });
      setNote(published ? "Holiday exception is now shown to clients." : "Holiday exception hidden from clients.");
    });
  }

  return (
    <section style={panel}>
      <h2 style={{ fontSize: 17, margin: "0 0 4px" }}>Opening hours and holidays</h2>
      <p style={{ ...muted, marginTop: 0 }}>Set local weekly hours and publish dated exceptions for each salon location.</p>
      {locations.length === 0 ? <p style={muted}>Add a location before configuring its hours.</p> : <>
        <label>Location
          <select value={locationId} onChange={(event) => setLocationId(event.target.value)} style={{ ...input, maxWidth: 420 }}>
            {locations.map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}
          </select>
        </label>
        {location && <p style={muted}>All times use {location.timezone || "the location's time zone"}.</p>}
        {problem && <p role="alert" style={{ color: "#8c2626" }}>{problem}</p>}
        {note && <p role="status" style={{ color: "#2c3f31" }}>{note}</p>}
        <form onSubmit={publishHours}>
          <h3 style={{ fontSize: 15 }}>Weekly hours</h3>
          <p style={muted}>Add one or more intervals per day for split shifts. The new version takes effect on the date below; prior versions remain available.</p>
          <label>Effective from
            <input style={{ ...input, maxWidth: 220 }} type="date" required value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} />
          </label>
          <div style={{ display: "grid", gap: 8, margin: "12px 0" }}>
            {intervals.map((interval, index) => <div key={`${index}-${interval.weekday}`} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
              <label>Day<select style={{ ...input, minWidth: 140 }} value={interval.weekday} onChange={(event) => updateInterval(index, "weekday", event.target.value)}>{WEEKDAYS.map((day, value) => <option value={value} key={day}>{day}</option>)}</select></label>
              <label>Opens<input style={{ ...input, width: 125 }} type="time" required value={interval.opens_at} onChange={(event) => updateInterval(index, "opens_at", event.target.value)} /></label>
              <label>Closes<input style={{ ...input, width: 125 }} type="time" required value={interval.closes_at} onChange={(event) => updateInterval(index, "closes_at", event.target.value)} /></label>
              <button type="button" style={{ ...button, background: "#f6e5e5", color: "#8c2626" }} onClick={() => setIntervals((current) => current.filter((_, at) => at !== index))}>Remove interval</button>
            </div>)}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" style={ghostButton} onClick={() => setIntervals((current) => [...current, { weekday: 0, opens_at: "09:00", closes_at: "17:00" }])}>Add interval</button>
            <button type="submit" style={button} disabled={working}>{working ? "Saving…" : "Publish weekly hours"}</button>
          </div>
        </form>
        <h3 style={{ fontSize: 15, marginTop: 24 }}>Holiday and date exceptions</h3>
        <form onSubmit={createException} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
          <label>Date<input style={{ ...input, width: 170 }} type="date" required value={exceptionForm.exception_date} onChange={(event) => setExceptionForm((v) => ({ ...v, exception_date: event.target.value }))} /></label>
          <label>Hours<select style={{ ...input, width: 170 }} value={exceptionForm.kind} onChange={(event) => setExceptionForm((v) => ({ ...v, kind: event.target.value }))}><option value="closed">Closed</option><option value="custom">Custom hours</option></select></label>
          {exceptionForm.kind === "custom" && <>
            <label>Opens<input style={{ ...input, width: 125 }} type="time" required value={exceptionForm.opens_at} onChange={(event) => setExceptionForm((v) => ({ ...v, opens_at: event.target.value }))} /></label>
            <label>Closes<input style={{ ...input, width: 125 }} type="time" required value={exceptionForm.closes_at} onChange={(event) => setExceptionForm((v) => ({ ...v, closes_at: event.target.value }))} /></label>
          </>}
          <label>Label<input style={{ ...input, width: 190 }} maxLength={120} value={exceptionForm.label} onChange={(event) => setExceptionForm((v) => ({ ...v, label: event.target.value }))} placeholder="Holiday hours" /></label>
          <button type="submit" style={button} disabled={working}>Save exception</button>
        </form>
        {exceptions.length === 0 ? <p style={muted}>No date exceptions configured.</p> : <ul style={{ paddingLeft: 20, display: "grid", gap: 8 }}>
          {exceptions.map((item) => <li key={item.id} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <span><strong>{item.exception_date}</strong> — {item.label || (item.kind === "closed" ? "Closed" : `${item.opens_at}–${item.closes_at}`)} · {item.published_at ? "Visible to clients" : "Draft"}</span>
            <button type="button" style={ghostButton} disabled={working} onClick={() => publishException(item, !item.published_at)}>{item.published_at ? "Hide from clients" : "Publish"}</button>
          </li>)}
        </ul>}
      </>}
    </section>
  );
}

// Quiet hours and limits (TASK-032): due sends inside the window wait for its end,
// over-cap sends wait a day, and the emergency stop holds everything visibly.
function QuietSettings({ tenantId }) {
  const [settings, setSettings] = useState({ quiet_start: "", quiet_end: "", emergency_stop: false, max_per_recipient_per_day: "" });
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState("");
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId) return;
    try {
      const res = await fetch(`/api/messaging?${new URLSearchParams({ tenant_id: tenantId })}`,
        { credentials: "include" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(errorText(body, "Messaging settings could not be loaded."));
      setSettings({ quiet_start: body.quiet_start || "", quiet_end: body.quiet_end || "",
        emergency_stop: !!body.emergency_stop,
        max_per_recipient_per_day: body.max_per_recipient_per_day ?? "" });
    } catch (err) {
      setProblem(err.message || "Messaging settings could not be loaded.");
    }
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  const save = (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const text = (name) => {
      const value = String(form.get(name) || "").trim();
      return value === "" ? null : value;
    };
    const cap = text("max_per_recipient_per_day");
    setWorking(true); setProblem(""); setNote("");
    fetch(`/api/messaging?${new URLSearchParams({ tenant_id: tenantId })}`,
      { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quiet_start: text("quiet_start"), quiet_end: text("quiet_end"),
          emergency_stop: form.get("emergency_stop") === "on",
          max_per_recipient_per_day: cap === null ? null : Number(cap) }) })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(errorText(body, "Messaging settings could not be saved."));
        setNote("Messaging settings saved.");
        await load();
      })
      .catch((err) => setProblem(err.message || "Messaging settings could not be saved."))
      .finally(() => setWorking(false));
  };

  return (
    <section style={panel}>
      <h2 style={{ fontSize: 17, margin: "0 0 4px" }}>Quiet hours and limits</h2>
      <p style={{ ...muted, marginTop: 0 }}>
        Empty window means no quiet enforcement. Sends inside the window wait; the stop holds everything.
      </p>
      {problem && <p role="alert" style={{ color: "#8c2626" }}>{problem}</p>}
      {note && <p role="status" style={{ color: "#2c3f31" }}>{note}</p>}
      <form onSubmit={save} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label>Quiet start
          <input style={{ ...input, maxWidth: 120 }} name="quiet_start" placeholder="21:00"
            pattern="([01][0-9]|2[0-3]):[0-5][0-9]" defaultValue={settings.quiet_start} />
        </label>
        <label>Quiet end
          <input style={{ ...input, maxWidth: 120 }} name="quiet_end" placeholder="08:00"
            pattern="([01][0-9]|2[0-3]):[0-5][0-9]" defaultValue={settings.quiet_end} />
        </label>
        <label>Daily cap per client
          <input style={{ ...input, maxWidth: 120 }} name="max_per_recipient_per_day" inputMode="numeric"
            pattern="[0-9]*" defaultValue={settings.max_per_recipient_per_day} placeholder="none" />
        </label>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="checkbox" name="emergency_stop" defaultChecked={settings.emergency_stop} />
          Emergency stop
        </label>
        <button type="submit" style={button} disabled={working}>Save</button>
      </form>
    </section>
  );
}

// Support access (TASK-051): the salon sees every grant request on its workspace,
// approves thirty minutes of masked diagnostics or declines, and reviews each use.
function SupportAccess({ tenantId }) {
  const [grants, setGrants] = useState([]);
  const [uses, setUses] = useState([]);
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState("");
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId) return;
    try {
      const res = await fetch(`/api/support?${new URLSearchParams({ tenant_id: tenantId })}`,
        { credentials: "include" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(errorText(body, "Support requests could not be loaded."));
      setGrants(body.grants || []);
      setUses(body.uses || []);
    } catch (err) {
      setProblem(err.message || "Support requests could not be loaded.");
    }
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  const decide = (grantId, action) => async () => {
    setWorking(true); setProblem(""); setNote("");
    try {
      const res = await fetch(`/api/support?${new URLSearchParams({ tenant_id: tenantId, grant_id: grantId, action })}`,
        { method: "POST", credentials: "include" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(errorText(body, "That decision could not be saved."));
      setNote(action === "approve"
        ? "Approved: thirty minutes of masked diagnostics from now."
        : "Declined: no access granted.");
      await load();
    } catch (err) {
      setProblem(err.message || "That decision could not be saved.");
    } finally { setWorking(false); }
  };

  const pending = grants.filter((grant) => grant.status === "requested");

  return (
    <section style={panel}>
      <h2 style={{ fontSize: 17, margin: "0 0 4px" }}>Support access</h2>
      <p style={{ ...muted, marginTop: 0 }}>
        Support sees masked diagnostics only, only with your approval, for thirty minutes at a time.
      </p>
      {problem && <p role="alert" style={{ color: "#8c2626" }}>{problem}</p>}
      {note && <p role="status" style={{ color: "#2c3f31" }}>{note}</p>}
      {pending.length === 0
        ? <p style={muted}>No pending requests.</p>
        : (
          <ul style={{ margin: "12px 0", paddingLeft: 20, display: "grid", gap: 10 }}>
            {pending.map((grant) => (
              <li key={grant.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <span><strong>{grant.scope}</strong> access — {grant.justification}</span>
                <span style={{ display: "flex", gap: 8 }}>
                  <button type="button" style={button} disabled={working} onClick={decide(grant.id, "approve")}>Approve 30 min</button>
                  <button type="button" style={{ ...button, background: "#8c2626" }} disabled={working} onClick={decide(grant.id, "reject")}>Decline</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      {uses.length > 0 && (
        <p style={muted}>Recent access: {uses.length} logged read(s), latest {uses[0].action}.</p>
      )}
    </section>
  );
}

// Salon billing (TASK-046): plan, trial state, hosted checkout and invoices. The page
// only displays what the API reports; plan changes activate through provider webhooks,
// never from this browser.
function Billing({ tenantId }) {
  const {session} = useWorkspace();
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
      setProblem("");
      const [plansBody, subBody] = await Promise.all([call("plans"), call("subscription")]);
      setPlans(plansBody.items || []);
      setSubscription(subBody);
      try {
        const invoicesBody = await call("invoices");
        setInvoices(invoicesBody.items || []);
      } catch {
        setInvoices([]);
        setProblem("Invoice history is unavailable until a billing provider is configured.");
      }
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
      setNote(`Sandbox checkout session ${body.session_id} is ${body.status}. No payment was taken. A plan changes only after a verified provider event.`);
    } catch (err) {
      setProblem(err.message || "Checkout could not start.");
    } finally { setWorking(false); }
  };

  const changePlan = (planCode) => async () => {
    setWorking(true); setProblem(""); setNote("");
    try {
      const body = await call("subscription/plan",
        { fetch: { method: "POST", headers: { "Content-Type": "application/json" },
                   body: JSON.stringify({ plan_code: planCode }) } });
      setNote(body.effective === "immediate"
        ? `Sandbox subscription changed to ${body.plan_code}. No payment was taken.`
        : `Sandbox downgrade to ${body.plan_code} scheduled for ${body.applies_at}. No payment was taken.`);
      await load();
    } catch (err) {
      setProblem(err.message || "The plan could not be changed.");
    } finally { setWorking(false); }
  };

  const cancel = async () => {
    setWorking(true); setProblem(""); setNote("");
    try {
      const withdrawing = !!subscription?.cancel_at_period_end;
      const body = await call("subscription/cancel",
        { fetch: { method: "POST", headers: { "Content-Type": "application/json" },
                   body: JSON.stringify({ at_period_end: !withdrawing }) } });
      setNote(body.cancel_at_period_end
        ? "Sandbox cancellation scheduled. No payment method or live subscription was changed."
        : "Sandbox cancellation withdrawn. No payment method or live subscription was changed.");
      await load();
    } catch (err) {
      setProblem(err.message || "Cancellation could not be saved.");
    } finally { setWorking(false); }
  };

  const portal = async () => {
    setWorking(true); setProblem(""); setNote("");
    try {
      await call("portal", { fetch: { method: "POST" } });
      setNote("Sandbox billing portal session created. This demo does not open a live payment page or expose payment details.");
    } catch (err) {
      setProblem(err.message || "The portal could not open.");
    } finally { setWorking(false); }
  };

  const money = (minor) => `$${(minor / 100).toFixed(2)}`;

  return (
    <section style={panel}>
      <h2 style={{ fontSize: 17, margin: "0 0 4px" }}>Billing</h2>
      {session.demo
        ? <p style={muted}>Local sandbox only: billing actions use a synthetic provider. No payment is taken and test provider pages are not opened. Only a verified provider event can change a subscription.</p>
        : <p style={muted}>Billing updates are unavailable until a live billing provider is configured. Prices shown are test hypotheses, not approved offers.</p>}
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
            {subscription?.status === "trial" ? (
              <button type="button" style={button} disabled={working || !session.demo} onClick={checkout(plan.code)}>
                {session.demo ? `Create test checkout for ${plan.name}` : `Choose ${plan.name}`}
              </button>
            ) : (
              <button type="button" style={button} disabled={working || !session.demo} onClick={changePlan(plan.code)}>
                {session.demo ? `Test switch to ${plan.name}` : `Switch to ${plan.name}`}
              </button>
            )}
          </li>
        ))}
      </ul>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" style={button} disabled={working || !session.demo} onClick={portal}>
          {session.demo ? "Create test billing portal session" : "Manage payment"}
        </button>
        {subscription && subscription.status !== "trial" && (
          <button type="button" style={{ ...button, background: "#8c2626" }} disabled={working || !session.demo} onClick={cancel}>
            {session.demo
              ? (subscription.cancel_at_period_end ? "Test: withdraw cancellation" : "Test: cancel at period end")
              : (subscription.cancel_at_period_end ? "Withdraw cancellation" : "Cancel at period end")}
          </button>
        )}
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
  const [verificationCode, setVerificationCode] = useState("");
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
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    post({}, { label: String(form.get("label") || ""), sender_identity: String(form.get("sender_identity") || "") },
      "Sender registered. Verify it before routing SMS reminders.").then((created) => {
        if (!created) return;
        formElement.reset();
        setVerificationCode(created.verification_code || "");
      });
  };
  const verify = (senderId) => (event) => {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code") || "");
    post({ sender_id: senderId, action: "verify" }, { code }, "Sender verified. SMS reminders can now use it.")
      .then((verified) => { if (verified) setVerificationCode(""); });
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
      <p style={muted}>Local demo verification is simulated; no carrier or client SMS is contacted.</p>
      {problem && <p role="alert" style={{ color: "#8c2626" }}>{problem}</p>}
      {note && <p role="status" style={{ color: "#2c3f31" }}>{note}</p>}
      {verificationCode && <p role="status" aria-live="polite" style={{ ...muted, overflowWrap: "anywhere" }}>
        Synthetic demo verification code: <strong>{verificationCode}</strong>. It is shown once and is not sent by SMS.
      </p>}
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

function WhatsAppSetup({ tenantId }) {
  const [senders, setSenders] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [unsent, setUnsent] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const request = async (resource, { method = "GET", itemId, action, body } = {}) => {
    const query = new URLSearchParams({ tenant_id: tenantId, resource });
    if (itemId) query.set("item_id", itemId);
    if (action) query.set("action", action);
    const response = await fetch(`/api/whatsapp?${query}`, {
      method, credentials: "include",
      ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(errorText(payload, "WhatsApp settings could not be updated."));
    return payload;
  };
  const load = useCallback(async () => {
    if (!tenantId) return;
    try {
      const [senderRows, templateRows, failedRows] = await Promise.all([
        request("senders"), request("templates"), request("communications"),
      ]);
      setSenders(senderRows.items || []); setTemplates(templateRows.items || []);
      setUnsent(failedRows.items || []); setError("");
    } catch (err) { setError(err.message || "WhatsApp settings could not be loaded."); }
  }, [tenantId]);
  useEffect(() => { load(); }, [load]);

  const act = async (resource, options, message) => {
    setBusy(true); setError(""); setNotice("");
    try { await request(resource, options); setNotice(message); await load(); }
    catch (err) { setError(err.message || "WhatsApp settings could not be updated."); }
    finally { setBusy(false); }
  };
  const createSender = (event) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    act("senders", { method: "POST", body: {
      business_name: String(form.get("business_name") || ""),
      phone_number: String(form.get("phone_number") || ""),
    } }, "WhatsApp sender saved as a draft."); event.currentTarget.reset();
  };
  const createTemplate = (event) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    act("templates", { method: "POST", body: {
      name: String(form.get("name") || ""), category: String(form.get("category") || "utility"),
      locale: String(form.get("locale") || "en"), body: String(form.get("body") || ""),
    } }, "Template saved as a draft."); event.currentTarget.reset();
  };
  const update = (resource, itemId, action, body, message) =>
    act(resource, { method: "POST", itemId, action, body }, message);

  return (
    <section style={panel}>
      <h2 style={{ fontSize: 17, margin: "0 0 4px" }}>WhatsApp setup</h2>
      <p style={{ ...muted, marginTop: 0 }}>Sandbox only: these approval actions are simulated. No ISV, WhatsApp provider, or client is contacted.</p>
      {error && <p role="alert" style={{ color: "#8c2626" }}>{error}</p>}
      {notice && <p role="status" style={{ color: "#2c3f31" }}>{notice}</p>}
      <h3>Business senders</h3>
      <ul style={{ paddingLeft: 20, display: "grid", gap: 8 }}>
        {senders.map((sender) => <li key={sender.id}>
          <strong>{sender.business_name}</strong> · {sender.phone_number} · {sender.status}
          {sender.quality_rating && ` · quality ${sender.quality_rating}`}
          {sender.messaging_limit && ` · ${sender.messaging_limit} recipients / 24h`}
          {sender.decision_note && <p style={muted}>{sender.decision_note}</p>}
          {sender.status === "draft" && <button type="button" style={button} disabled={busy}
            onClick={() => update("senders", sender.id, "submit", {}, "Sender submitted to the local ISV sandbox.")}>Submit to sandbox</button>}
          {sender.status === "submitted" && <button type="button" style={button} disabled={busy}
            onClick={() => update("senders", sender.id, "decide", { quality_rating: "green", messaging_limit: 1000 }, "Sandbox sender approval recorded.")}>Approve in sandbox</button>}
        </li>)}
        {senders.length === 0 && <li style={muted}>No WhatsApp sender registered.</li>}
      </ul>
      <form onSubmit={createSender} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label>Business name<input style={{ ...input, maxWidth: 220 }} name="business_name" maxLength={120} required /></label>
        <label>Business number<input style={{ ...input, maxWidth: 220 }} name="phone_number" placeholder="+14165550132" required /></label>
        <button type="submit" style={button} disabled={busy}>Register sender</button>
      </form>
      <h3>Message templates</h3>
      <ul style={{ paddingLeft: 20, display: "grid", gap: 8 }}>
        {templates.map((template) => <li key={template.id}>
          <strong>{template.name}</strong> · {template.category} · {template.locale} · {template.status}
          {template.status === "draft" && <button type="button" style={button} disabled={busy}
            onClick={() => update("templates", template.id, "submit", {}, "Template submitted to the local ISV sandbox.")}>Submit to sandbox</button>}
          {template.status === "submitted" && <button type="button" style={button} disabled={busy}
            onClick={() => update("templates", template.id, "decide", {}, "Sandbox template approval recorded.")}>Approve in sandbox</button>}
        </li>)}
        {templates.length === 0 && <li style={muted}>No WhatsApp templates yet.</li>}
      </ul>
      <form onSubmit={createTemplate} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10, alignItems: "end" }}>
        <label>Template name<input style={input} name="name" pattern="[a-z0-9_]{1,64}" required /></label>
        <label>Category<select style={input} name="category"><option value="utility">Utility</option><option value="marketing">Marketing</option></select></label>
        <label>Language tag<input style={input} name="locale" defaultValue="en" pattern="[a-z]{2}(_[A-Z]{2})?" required /></label>
        <label style={{ gridColumn: "1 / -1" }}>Template body<textarea style={input} name="body" maxLength={1024} required placeholder="Use sequential placeholders such as {{1}}" /></label>
        <button type="submit" style={button} disabled={busy}>Save template draft</button>
      </form>
      <h3>Unsent WhatsApp tasks</h3>
      {unsent.length === 0 ? <p style={muted}>No failed WhatsApp sends need attention.</p> : (
        <ul style={{ paddingLeft: 20 }}>{unsent.map((task) => <li key={task.id}>
          {task.purpose}: {task.skip_reason || task.state}
        </li>)}</ul>
      )}
    </section>
  );
}

// Like the team page, the tenant id here only selects which salon to load. Every
// authorization decision is made by the API from the session cookie.
export default function Settings() {
  const router = useRouter();
  const {tenantId, setTenantId} = useWorkspace();
  const [steps, setSteps] = useState([]);
  const [locations, setLocations] = useState([]);
  const [readiness, setReadiness] = useState(null);
  const [settings, setSettings] = useState({});
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [bookingSlug, setBookingSlug] = useState("");
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
      const [setupRes, settingsRes, locationsRes] = await Promise.all([
        fetch(url("setup"), { credentials: "include" }),
        fetch(url("settings"), { credentials: "include" }),
        fetch(url("locations"), { credentials: "include" }),
      ]);
      if (!setupRes.ok) {
        setError(errorText(await setupRes.json().catch(() => null), "Setup progress could not be loaded."));
        return;
      }
      const setup = await setupRes.json();
      setSteps(setup.steps || []);
      setReadiness({ accepting: setup.accepting_bookings, missing: setup.missing_setup || [] });
      if (locationsRes.ok) {
        const locations = await locationsRes.json();
        setLocations(locations.items || []);
        setBookingSlug(locations.items?.[0]?.booking_slug || "");
      } else { setBookingSlug(""); setLocations([]); }
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
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
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

        {error && <p role="alert" style={{ ...panel, color: "#8c2626" }}>{error}</p>}
        <p role="status" aria-live="polite" style={{ ...panel, color: "#2c3f31", display: status ? "block" : "none" }}>{status}</p>

        {!tenantId ? <p style={muted}>Select a salon from your account to continue.</p> : (
          <>
            <section style={panel}>
              <h2 style={{ fontSize: 17, margin: "0 0 6px" }}>Setup checklist</h2>
              <p style={{ ...muted, marginTop: 0 }}>
                {readiness?.accepting
                  ? "Your booking page is open and accepting bookings."
                  : `Your booking page is not accepting bookings yet. Still to do: ${(readiness?.missing || []).map((s) => STEP_LABEL[s] || s).join(", ")}.`}
              </p>
              {bookingSlug && <p><a href={`/book/${encodeURIComponent(bookingSlug)}`} style={{ color: "#334b39", fontWeight: 600 }}>Preview public booking page →</a></p>}
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

            <LocationHours tenantId={tenantId} locations={locations} />

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

            <WhatsAppSetup tenantId={tenantId} />

            <QuietSettings tenantId={tenantId} />

            <SupportAccess tenantId={tenantId} />

            <Billing tenantId={tenantId} />

            <p><a href="/team">Manage your team →</a></p>
          </>
        )}
      </main>
    </div>
  );
}
export const getServerSideProps=privatePage("staff");
