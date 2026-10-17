import {useWorkspace} from "../components/Workspace";
import {privatePage} from "../lib/session";
import { useCallback, useEffect, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";

const panel = { background: "#ffffff", border: "1px solid #e8e6df", borderRadius: 14, padding: 20, marginBottom: 18 };
const muted = { color: "#747970", fontSize: 13 };
const input = { display: "block", width: "100%", boxSizing: "border-box", marginTop: 6, padding: 10, border: "1px solid #c9c6bd", borderRadius: 7 };
const button = { padding: "10px 16px", background: "#334b39", color: "#fff", border: 0, borderRadius: 8, cursor: "pointer" };
const KIND_LABEL = { opt_out: "Opt-out", help_request: "Help request", inbound_reply: "Reply" };

function errorText(payload, fallback) {
  const detail = payload?.detail;
  if (typeof detail === "string") return detail;
  if (detail?.code) return detail.code.replace(/_/g, " ");
  return fallback;
}

// Staff follow-up inbox (TASK-034): client replies linked to their client record with a
// short triage preview. Staff resolve each task with a note after calling back.
export default function Inbox() {
  const router = useRouter();
  const {tenantId, setTenantId} = useWorkspace();
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("open");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [replyKeys, setReplyKeys] = useState({});

  const load = useCallback(async () => {
    if (!tenantId) return;
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/inbox?${new URLSearchParams({ tenant_id: tenantId, status: filter })}`,
        { credentials: "include" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(errorText(body, "The inbox could not be loaded."));
      setItems(body.items || []);
    } catch (err) {
      setError(err.message || "The inbox could not be loaded.");
    } finally { setBusy(false); }
  }, [tenantId, filter]);

  useEffect(() => { load(); }, [load]);

  const resolve = (taskId) => async (event) => {
    event.preventDefault();
    const note = String(new FormData(event.currentTarget).get("note") || "");
    setBusy(true); setError(""); setStatus("");
    try {
      const res = await fetch(`/api/inbox?${new URLSearchParams({ tenant_id: tenantId, task_id: taskId })}`,
        { method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resolution: "done", note }) });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(errorText(body, "That task could not be resolved."));
      setStatus("Task resolved.");
      await load();
    } catch (err) {
      setError(err.message || "That task could not be resolved.");
    } finally { setBusy(false); }
  };

  const reply = (item) => async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const message = String(new FormData(form).get("reply") || "");
    const key = replyKeys[item.id] || crypto.randomUUID();
    setReplyKeys((previous) => ({ ...previous, [item.id]: key }));
    setBusy(true); setError(""); setStatus("");
    try {
      const res = await fetch(`/api/inbox?${new URLSearchParams({ tenant_id: tenantId, task_id: item.id, action: "reply" })}`,
        { method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json", "Idempotency-Key": key },
          body: JSON.stringify({ body: message }) });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(errorText(body, "That reply could not be queued."));
      setReplyKeys((previous) => { const next = { ...previous }; delete next[item.id]; return next; });
      form.reset();
      setStatus("Reply queued for delivery.");
      await load();
    } catch (err) {
      setError(err.message || "That reply could not be queued.");
    } finally { setBusy(false); }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f5f3ef", color: "#20231f", fontFamily: "Inter, system-ui, sans-serif" }}>
      <Head><title>Follow-up inbox — Salon Operations</title></Head>
      <main style={{ padding: "38px 5vw", maxWidth: 1080, margin: "0 auto" }}>
        <header style={{ marginBottom: 24 }}>
          <div style={muted}>Client messages</div>
          <h1 style={{ margin: "6px 0", fontSize: 30 }}>Follow-up inbox</h1>
          <p style={muted}>Message content is hidden. Reply only when the channel allows it, then resolve follow-up.</p>
        </header>

        <section style={panel}>
          
          <label style={{ display: "block", maxWidth: 220, marginTop: 12 }}>Show
            <select style={input} value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="open">Open</option>
              <option value="done">Done</option>
              <option value="dismissed">Dismissed</option>
              <option value="all">All</option>
            </select>
          </label>
        </section>

        {error && <p role="alert" style={{ ...panel, color: "#8c2626" }}>{error}</p>}
        {status && <p role="status" style={{ ...panel, color: "#2c3f31" }}>{status}</p>}

        {!tenantId ? <p style={muted}>Select a salon from your account to continue.</p> : (
          <section style={panel}>
            {items.length === 0 && <p style={muted}>{busy ? "Loading…" : "Nothing here."}</p>}
            <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 16 }}>
              {items.map((item) => (
                <li key={item.id} style={{ display: "grid", gap: 6 }}>
                  <span>
                    <strong>{KIND_LABEL[item.kind] || item.kind}</strong>
                    {" — "}{item.client_name || "unlinked sender"}
                    {" · "}{item.channel}
                  </span>
                  <span style={muted}>{item.detail}</span>
                  {item.status === "open" && <>
                    {item.client_id && ["help_request", "inbound_reply"].includes(item.kind)
                      && (item.channel === "sms" || item.reply_window_open) && (
                      <form onSubmit={reply(item)} style={{ display: "flex", gap: 8, marginTop: 4 }}>
                        <input name="reply" maxLength={2000} required placeholder="Write a reply"
                          aria-label={`Reply to ${item.client_name || "client"}`}
                          onChange={() => setReplyKeys((previous) => { const next = { ...previous }; delete next[item.id]; return next; })}
                          style={{ ...input, marginTop: 0, maxWidth: 420 }} />
                        <button type="submit" style={button} disabled={busy}>Queue reply</button>
                      </form>
                    )}
                    {item.channel === "whatsapp" && !item.reply_window_open
                      && <span style={muted}>WhatsApp reply window closed.</span>}
                    <form onSubmit={resolve(item.id)} style={{ display: "flex", gap: 8, marginTop: 4 }}>
                      <input name="note" maxLength={500} placeholder="Resolution note"
                        aria-label={`Resolution note for ${item.title}`}
                        style={{ ...input, marginTop: 0, maxWidth: 320 }} />
                      <button type="submit" style={button} disabled={busy}>Resolve</button>
                    </form>
                  </>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}

export const getServerSideProps=privatePage("staff");
