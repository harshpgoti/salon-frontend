import {privatePage} from "../lib/session";
import { useState } from "react";
import Head from "next/head";

export default function Onboarding() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true); setError(""); setResult(null);
    try {
      const response = await fetch("/api/onboarding", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail?.code === "authentication_required" ? "Sign in with your verified salon account to continue." : data.detail?.code || "Setup could not be completed.");
      setResult(data);
    } catch (err) { setError(err.message || "Setup service is unavailable."); }
    finally { setBusy(false); }
  }

  return <main style={{ maxWidth: 600, margin: "8vh auto", padding: 28, fontFamily: "system-ui", color: "#20231f" }}>
    <Head><title>Set up your salon · Salon Operations</title></Head>
    <a href="/salon" style={{ color: "#526b55" }}>← Salon overview</a>
    <h1>Set up your salon</h1>
    <p>Start with your business and first location. You can add services, team members and hours next.</p>
    <form onSubmit={submit} style={{ display: "grid", gap: 16 }}>
      <label>Business name<input name="business_name" required maxLength={120} style={field} /></label>
      <label>First location name<input name="location_name" required maxLength={120} style={field} /></label>
      <label>Location time zone<input name="timezone" required defaultValue="America/Toronto" maxLength={64} style={field} /><small>Use an IANA time zone, such as America/Toronto.</small></label>
      <button disabled={busy} style={{ padding: 13, background: "#334b39", color: "white", border: 0, borderRadius: 8 }}>{busy ? "Creating…" : "Create salon workspace"}</button>
    </form>
    {error && <p role="alert" style={{ color: "#9b2c2c" }}>{error}</p>}
    {result && <section aria-live="polite"><h2>Workspace created</h2><p>{result.business_name} · {result.location_name}</p><p>Booking link slug: <code>{result.booking_slug}</code></p><p><a href={`/settings?tenant=${result.tenant_id}`} style={{ color: "#334b39", fontWeight: 600 }}>Continue setup →</a></p><p><a href={`/clients?tenant=${result.tenant_id}`} style={{ color: "#334b39", fontWeight: 600 }}>Add your first client →</a></p></section>}
  </main>;
}

const field = { display: "block", width: "100%", boxSizing: "border-box", marginTop: 6, padding: 11, border: "1px solid #bbb", borderRadius: 7 };

export const getServerSideProps=privatePage("staff");
