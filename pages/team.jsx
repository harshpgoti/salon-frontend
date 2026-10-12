import { useCallback, useEffect, useState } from "react";
import Head from "next/head";

const ROLES = ["manager", "receptionist", "stylist", "analyst"];
const ROLE_LABEL = { owner: "Owner", manager: "Manager", receptionist: "Receptionist", stylist: "Stylist", analyst: "Analyst" };

const panel = { background: "#ffffff", border: "1px solid #e8e6df", borderRadius: 14, padding: 20, marginBottom: 18 };
const muted = { color: "#747970", fontSize: 13 };
const input = { display: "block", width: "100%", boxSizing: "border-box", marginTop: 6, padding: 10, border: "1px solid #c9c6bd", borderRadius: 7 };
const button = { padding: "10px 16px", background: "#334b39", color: "#fff", border: 0, borderRadius: 8, cursor: "pointer" };
const ghostButton = { ...button, background: "#e8eee4", color: "#2c3f31" };
const dangerButton = { ...button, background: "#f6e5e5", color: "#8c2626" };

function errorText(payload, fallback) {
  const detail = payload?.detail;
  if (typeof detail === "string") return detail;
  if (detail?.code) return detail.code.replace(/_/g, " ");
  if (payload?.error) return String(payload.error).replace(/_/g, " ");
  return fallback;
}

// The API derives both the caller and the tenant from the session cookie, so
// the tenant id here is only a display/route parameter. Every authorization
// decision is made by the API from the session, never by this page.
export default function Team() {
  const [tenantId, setTenantId] = useState("");
  const [locations, setLocations] = useState([]);
  const [members, setMembers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("stylist");
  const [inviteLocations, setInviteLocations] = useState([]);
  const [transferEmail, setTransferEmail] = useState("");

  // /api/team is one flat route: the proxy reads tenant_id, collection, id and
  // action from the query string, so every call below must use that form.
  const url = useCallback(
    (collection, params = {}) => {
      const query = new URLSearchParams({ tenant_id: tenantId, collection, ...params });
      return `/api/team?${query.toString()}`;
    },
    [tenantId],
  );

  const load = useCallback(async () => {
    if (!tenantId) return;
    setBusy(true); setError("");
    try {
      const [locRes, memRes, invRes] = await Promise.all([
        fetch(url("locations"), { credentials: "include" }),
        fetch(url("memberships"), { credentials: "include" }),
        fetch(url("invitations"), { credentials: "include" }),
      ]);
      if (!memRes.ok) {
        setError(errorText(await memRes.json().catch(() => null), "Team members could not be loaded."));
        setMembers([]); setInvitations([]); setLocations([]);
        return;
      }
      const locBody = locRes.ok ? await locRes.json() : { items: [] };
      const memBody = await memRes.json();
      const invBody = invRes.ok ? await invRes.json() : { items: [] };
      setLocations(locBody.items || []);
      setMembers(memBody.items || []);
      setInvitations(invBody.items || []);
    } catch {
      setError("The team service is unavailable.");
    } finally {
      setBusy(false);
    }
  }, [tenantId, url]);

  useEffect(() => { load(); }, [load]);

  async function call(promise, okMessage) {
    setBusy(true); setError(""); setStatus("");
    try {
      await promise;
      setStatus(okMessage);
      await load();
    } catch (err) {
      setError(err.message || "That change could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function sendInvite(event) {
    event.preventDefault();
    await call(
      fetch(url("invitations"), {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole, location_ids: inviteLocations }),
      }).then(async (r) => { if (!r.ok) throw new Error(errorText(await r.json().catch(() => null), "Invitation could not be sent.")); }),
      `Invitation recorded for ${inviteEmail}.`,
    );
    setInviteEmail("");
  }

  async function revokeInvitation(invitationId) {
    await call(
      fetch(url("invitations", { id: invitationId, action: "revoke" }), { method: "POST", credentials: "include" })
        .then(async (r) => { if (!r.ok) throw new Error(errorText(await r.json().catch(() => null), "Invitation could not be revoked.")); }),
      "Invitation revoked.",
    );
  }

  async function changeRole(member, role) {
    if (role === member.role) return;
    const stated = window.prompt(
      `Reason for changing ${member.email || "this member"} to ${ROLE_LABEL[role]} (recorded in the tenant audit trail):`,
      `Role changed to ${ROLE_LABEL[role]}`,
    );
    if (!stated || !stated.trim()) return;
    await call(
      fetch(url("memberships", { id: member.user_id }), {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, reason: stated.trim() }),
      }).then(async (r) => { if (!r.ok) throw new Error(errorText(await r.json().catch(() => null), "Role could not be changed.")); }),
      `${member.email || "Member"} is now a ${ROLE_LABEL[role]}.`,
    );
  }

  async function deactivate(member) {
    const reason = window.prompt(
      `Reason for removing ${member.email || "this member"} (recorded in the tenant audit trail):`,
      "Left the salon",
    );
    if (!reason || !reason.trim()) return;
    await call(
      fetch(url("memberships", { id: member.user_id }), {
        method: "DELETE", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      })
        .then(async (r) => { if (!r.ok) throw new Error(errorText(await r.json().catch(() => null), "Member could not be deactivated.")); }),
      `${member.email || "Member"} was removed from the team.`,
    );
  }

  async function requestTransfer(event) {
    event.preventDefault();
    await call(
      fetch(url("ownership-transfers"), {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_email: transferEmail }),
      }).then(async (r) => { if (!r.ok) throw new Error(errorText(await r.json().catch(() => null), "Ownership transfer could not be requested.")); }),
      `Ownership transfer requested for ${transferEmail}.`,
    );
    setTransferEmail("");
  }

  const pendingInvitations = invitations.filter((i) => i.state === "pending");

  return (
    <div style={{ minHeight: "100vh", background: "#f5f3ef", color: "#20231f", fontFamily: "Inter, system-ui, sans-serif" }}>
      <Head><title>Team · Salon Operations</title></Head>
      <main style={{ padding: "38px 5vw", maxWidth: 1180, margin: "0 auto" }}>
        <header style={{ marginBottom: 24 }}>
          <div style={muted}>Team management</div>
          <h1 style={{ margin: "6px 0", fontSize: 30 }}>Salon team</h1>
          <p style={muted}>Invite staff, set roles and locations, and hand over ownership.</p>
        </header>

        <section style={panel}>
          <label style={{ display: "block", maxWidth: 420 }}>
            Tenant workspace
            <input
              style={input}
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value.trim())}
              placeholder="Salon workspace UUID"
              aria-describedby="tenant-help"
            />
          </label>
          <small id="tenant-help" style={{ ...muted, display: "block", marginTop: 8 }}>
            Your session decides what you can see. This id only selects which salon the page loads.
          </small>
        </section>

        {error && <p role="alert" style={{ ...panel, color: "#8c2626", marginBottom: 18 }}>{error}</p>}
        <p role="status" aria-live="polite" style={{ ...panel, color: "#2c3f31", marginBottom: 18, display: status ? "block" : "none" }}>{status}</p>

        {!tenantId ? (
          <p style={muted}>Enter your workspace id to manage the team.</p>
        ) : (
          <>
            <section style={panel}>
              <h2 style={{ fontSize: 17, margin: "0 0 14px" }}>Invite a team member</h2>
              <form onSubmit={sendInvite} style={{ display: "grid", gap: 14 }}>
                <label style={{ maxWidth: 420 }}>Email
                  <input style={input} type="email" required maxLength={254} value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)} placeholder="staff@example.com" />
                </label>
                <label style={{ maxWidth: 260 }}>Role
                  <select style={input} value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                    {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </select>
                </label>
                <fieldset style={{ border: "1px solid #e8e6df", borderRadius: 10, padding: 14 }}>
                  <legend style={{ ...muted, padding: "0 6px" }}>Locations</legend>
                  {locations.length === 0 ? (
                    <span style={muted}>No locations available yet.</span>
                  ) : locations.map((loc) => (
                    <label key={loc.id} style={{ display: "block", marginBottom: 6 }}>
                      <input
                        type="checkbox"
                        checked={inviteLocations.includes(loc.id)}
                        onChange={(e) => setInviteLocations((current) =>
                          e.target.checked ? [...current, loc.id] : current.filter((id) => id !== loc.id))
                        }
                      />{" "}{loc.display_name}
                    </label>
                  ))}
                </fieldset>
                <div>
                  <button type="submit" style={button} disabled={busy || inviteLocations.length === 0}>
                    {busy ? "Working…" : "Send invitation"}
                  </button>
                  {inviteLocations.length === 0 && locations.length > 0 && (
                    <small style={{ ...muted, marginLeft: 12 }}>Select at least one location.</small>
                  )}
                </div>
              </form>
            </section>

            <section style={panel}>
              <h2 style={{ fontSize: 17, margin: "0 0 14px" }}>Current team</h2>
              {members.length === 0 ? (
                <p style={muted}>No team members to show.</p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                    <thead>
                      <tr>
                        {["Email", "Role", "Locations", ""].map((h) => (
                          <th key={h} style={{ textAlign: "left", padding: "8px 10px", borderBottom: "1px solid #eeede7", color: "#747970" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((member) => (
                        <tr key={member.user_id}>
                          <td style={{ padding: "10px" }}>
                            {member.email || "(email not shared)"}
                            {member.email_verified ? null : <small style={{ ...muted, display: "block" }}>Unverified</small>}
                          </td>
                          <td style={{ padding: "10px" }}>
                            {member.role === "owner" ? (
                              <span>Owner</span>
                            ) : (
                              <select
                                aria-label={`Role for ${member.email || member.user_id}`}
                                style={{ ...input, marginTop: 0, padding: 6 }}
                                value={member.role}
                                disabled={busy}
                                onChange={(e) => changeRole(member, e.target.value)}
                              >
                                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                              </select>
                            )}
                          </td>
                          <td style={{ padding: "10px" }}>
                            {(member.location_ids || []).length === 0
                              ? <span style={muted}>None</span>
                              : (member.location_ids || []).map((id) => {
                                  const match = locations.find((l) => l.id === id);
                                  return <span key={id} style={{ ...muted, marginRight: 8 }}>{match ? match.display_name : "Location"}</span>;
                                })}
                          </td>
                          <td style={{ padding: "10px", textAlign: "right" }}>
                            {member.role !== "owner" && (
                              <button type="button" style={dangerButton} disabled={busy} onClick={() => deactivate(member)}>
                                Deactivate
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section style={panel}>
              <h2 style={{ fontSize: 17, margin: "0 0 14px" }}>Pending invitations</h2>
              {pendingInvitations.length === 0 ? (
                <p style={muted}>No invitations are waiting for a response.</p>
              ) : (
                pendingInvitations.map((inv) => (
                  <div key={inv.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "12px 0", borderTop: "1px solid #eeede7" }}>
                    <span style={{ fontSize: 14 }}>{inv.email} · {ROLE_LABEL[inv.role] || inv.role} · expires {new Date(inv.expires_at).toLocaleDateString()}</span>
                    <button type="button" style={ghostButton} disabled={busy} onClick={() => revokeInvitation(inv.id)}>Revoke</button>
                  </div>
                ))
              )}
            </section>

            <section style={panel}>
              <h2 style={{ fontSize: 17, margin: "0 0 6px" }}>Transfer ownership</h2>
              <p style={{ ...muted, marginTop: 0 }}>The target must sign in with a verified email and accept before ownership moves.</p>
              <form onSubmit={requestTransfer} style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
                <label style={{ maxWidth: 420, flex: 1 }}>New owner email
                  <input style={input} type="email" required maxLength={254} value={transferEmail}
                    onChange={(e) => setTransferEmail(e.target.value)} placeholder="owner@example.com" />
                </label>
                <button type="submit" style={button} disabled={busy}>{busy ? "Working…" : "Request transfer"}</button>
              </form>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
