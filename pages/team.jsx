import {useWorkspace} from "../components/Workspace";
import Link from "next/link";
import {privatePage} from "../lib/session";
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
  const {tenantId, setTenantId} = useWorkspace();
  const [locations, setLocations] = useState([]);
  const [members, setMembers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [staffProfiles, setStaffProfiles] = useState([]);
  const [services, setServices] = useState([]);
  const [selectedProfile, setSelectedProfile] = useState("");
  const [staffSchedule, setStaffSchedule] = useState({ shifts: [], leave: [], service_ids: [], location_ids: [] });
  const [deactivationPreview, setDeactivationPreview] = useState(null);
  const [deactivationDate, setDeactivationDate] = useState("");
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
      const [locRes, memRes, invRes, profileRes, serviceRes] = await Promise.all([
        fetch(url("locations"), { credentials: "include" }),
        fetch(url("memberships"), { credentials: "include" }),
        fetch(url("invitations"), { credentials: "include" }),
        fetch(url("staff", { include_deactivated: "true" }), { credentials: "include" }),
        fetch(url("services"), { credentials: "include" }),
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
      const profiles = profileRes.ok ? await profileRes.json() : { items: [] };
      const catalog = serviceRes.ok ? await serviceRes.json() : { items: [] };
      setStaffProfiles(profiles.items || []);
      setServices((catalog.items || []).filter((item) => !item.archived_at));
    } catch {
      setError("The team service is unavailable.");
    } finally {
      setBusy(false);
    }
  }, [tenantId, url]);

  const refreshSchedule = useCallback(async (profileId = selectedProfile) => {
    if (!tenantId || !profileId) return;
    const request = (resource) => fetch(url(resource, { staff_id: profileId }), { credentials: "include" })
      .then(async (response) => { if (!response.ok) throw new Error("Staff schedule could not be loaded."); return response.json(); });
    const [shifts, leave, qualifications, assigned] = await Promise.all([
      request("staff_shifts"), request("staff_leave"), request("staff_qualifications"), request("staff_locations"),
    ]);
    setStaffSchedule({ shifts: shifts.items || [], leave: leave.items || [],
      service_ids: qualifications.service_ids || [], location_ids: assigned.location_ids || [] });
  }, [tenantId, selectedProfile, url]);

  useEffect(() => {
    if (!tenantId || !selectedProfile) { setStaffSchedule({ shifts: [], leave: [], service_ids: [], location_ids: [] }); return; }
    let cancelled = false;
    refreshSchedule().catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [tenantId, selectedProfile, refreshSchedule]);

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

  async function saveStaffSchedule(resource, method, body) {
    if (!selectedProfile) return;
    setBusy(true); setError(""); setStatus("");
    try {
      const response = await fetch(url(resource, { staff_id: selectedProfile }), {
        method, credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(errorText(await response.json().catch(() => null), "Staff schedule could not be saved."));
      await refreshSchedule();
      setStatus("Staff schedule updated.");
      return true;
    } catch (err) { setError(err.message || "Staff schedule could not be saved."); }
    finally { setBusy(false); }
    return false;
  }

  async function addShift(event) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    const body = Object.fromEntries(form.entries());
    body.weekday = Number(body.weekday);
    try { body.breaks = body.breaks ? JSON.parse(body.breaks) : []; }
    catch { setError("Breaks must be a JSON list of start/end intervals."); return; }
    if (!Array.isArray(body.breaks)) { setError("Breaks must be a JSON list of start/end intervals."); return; }
    if (!body.effective_from) delete body.effective_from;
    if (!body.effective_to) delete body.effective_to;
    if (await saveStaffSchedule("staff_shifts", "POST", body)) element.reset();
  }

  async function addLeave(event) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    const body = Object.fromEntries(form.entries());
    body.approved = form.get("approved") === "on";
    if (await saveStaffSchedule("staff_leave", "POST", body)) element.reset();
  }

  async function saveAssignments(resource, key, values) {
    const body = resource === "staff_qualifications" ? { service_ids: values } : { location_ids: values };
    if (await saveStaffSchedule(resource, "PUT", body))
      setStaffSchedule((current) => ({ ...current, [key]: values }));
  }

  async function previewDeactivation() {
    if (!selectedProfile || !deactivationDate) return;
    setBusy(true); setError(""); setDeactivationPreview(null);
    try {
      const response = await fetch(url("staff", { id: selectedProfile, action: "deactivation-preview", on: deactivationDate }), { credentials: "include" });
      const body = await response.json();
      if (!response.ok) throw new Error(errorText(body, "Deactivation preview could not be loaded."));
      setDeactivationPreview(body);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function deactivateProfile() {
    if (!selectedProfile || !deactivationPreview || deactivationPreview.on !== deactivationDate
        || deactivationPreview.requires_resolution) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(url("staff", { id: selectedProfile, action: "deactivate" }), {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deactivated_on: deactivationDate }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(errorText(body, "Staff profile could not be deactivated."));
      setStatus("Staff profile deactivation scheduled.");
      setDeactivationPreview(null);
      await load();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
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

        

        {error && <p role="alert" style={{ ...panel, color: "#8c2626", marginBottom: 18 }}>{error}</p>}
        <p role="status" aria-live="polite" style={{ ...panel, color: "#2c3f31", marginBottom: 18, display: status ? "block" : "none" }}>{status}</p>

        {!tenantId ? (
          <p style={muted}>Select a salon from your account to continue.</p>
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
              <h2 style={{ fontSize: 17, margin: "0 0 6px" }}>Staff scheduling</h2>
              <p style={muted}>Set each bookable profile’s locations, services, weekly shifts and approved leave. Booking commits recheck these rules.</p>
              <label style={{ display: "block", maxWidth: 440 }}>Staff profile
                <select style={input} value={selectedProfile} onChange={(e) => { setSelectedProfile(e.target.value); setDeactivationPreview(null); }}>
                  <option value="">Choose a staff profile</option>
                  {staffProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.display_name}{profile.deactivated_on ? ` · deactivates ${profile.deactivated_on}` : ""}</option>)}
                </select>
              </label>
              {selectedProfile && <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 18, marginTop: 18 }}>
                  <fieldset style={{ border: "1px solid #e8e6df", borderRadius: 10, padding: 14 }}>
                    <legend style={{ ...muted, padding: "0 6px" }}>Assigned locations</legend>
                    {locations.map((location) => <label key={location.id} style={{ display: "block", margin: "8px 0" }}>
                      <input type="checkbox" checked={staffSchedule.location_ids.includes(location.id)} disabled={busy}
                        onChange={(e) => saveAssignments("staff_locations", "location_ids", e.target.checked
                          ? [...staffSchedule.location_ids, location.id] : staffSchedule.location_ids.filter((id) => id !== location.id))} /> {location.display_name}
                    </label>)}
                  </fieldset>
                  <fieldset style={{ border: "1px solid #e8e6df", borderRadius: 10, padding: 14 }}>
                    <legend style={{ ...muted, padding: "0 6px" }}>Qualified services</legend>
                    {services.map((service) => <label key={service.id} style={{ display: "block", margin: "8px 0" }}>
                      <input type="checkbox" checked={staffSchedule.service_ids.includes(service.id)} disabled={busy}
                        onChange={(e) => saveAssignments("staff_qualifications", "service_ids", e.target.checked
                          ? [...staffSchedule.service_ids, service.id] : staffSchedule.service_ids.filter((id) => id !== service.id))} /> {service.name}
                    </label>)}
                  </fieldset>
                </div>
                <form onSubmit={addShift} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12, marginTop: 18, alignItems: "end" }}>
                  <strong style={{ gridColumn: "1/-1" }}>Add weekly shift</strong>
                  <label>Location<select name="location_id" style={input} required defaultValue=""><option value="">Choose location</option>{locations.filter((loc) => staffSchedule.location_ids.includes(loc.id)).map((loc) => <option key={loc.id} value={loc.id}>{loc.display_name}</option>)}</select></label>
                  <label>Weekday<select name="weekday" style={input} defaultValue="1">{["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"].map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label>
                  <label>Starts<input name="starts_at" type="time" style={input} required defaultValue="09:00" /></label>
                  <label>Ends<input name="ends_at" type="time" style={input} required defaultValue="17:00" /></label>
                  <label>Effective from<input name="effective_from" type="date" style={input} /></label>
                  <label>Effective to<input name="effective_to" type="date" style={input} /></label>
                  <label>Breaks (JSON)<input name="breaks" style={input} placeholder='[{"start":"12:00","end":"12:30"}]' /></label>
                  <button type="submit" style={button} disabled={busy || staffSchedule.location_ids.length === 0}>Add shift</button>
                </form>
                <div style={{ ...muted, marginTop: 10 }}>
                  {staffSchedule.shifts.length ? staffSchedule.shifts.map((shift) => <div key={shift.id}>{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][shift.weekday]} · {shift.starts_at}–{shift.ends_at} · {locations.find((loc) => loc.id === shift.location_id)?.display_name || "Location"} · effective {shift.effective_from}{shift.effective_to ? ` to ${shift.effective_to}` : " onward"}</div>) : "No weekly shifts configured."}
                </div>
                <form onSubmit={addLeave} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12, marginTop: 18, alignItems: "end" }}>
                  <strong style={{ gridColumn: "1/-1" }}>Record staff leave</strong>
                  <label>Starts<input name="starts_on" type="date" style={input} required /></label>
                  <label>Ends<input name="ends_on" type="date" style={input} required /></label>
                  <label>Reason<input name="reason" style={input} maxLength={240} /></label>
                  <label style={{ alignSelf: "center" }}><input name="approved" type="checkbox" /> Approved leave</label>
                  <button type="submit" style={button} disabled={busy}>Record leave</button>
                </form>
                <div style={{ ...muted, marginTop: 10 }}>{staffSchedule.leave.length ? staffSchedule.leave.map((leave) => <div key={leave.id}>{leave.starts_on} to {leave.ends_on} · {leave.approved ? "approved" : "pending approval"}{leave.reason ? ` · ${leave.reason}` : ""}</div>) : "No leave recorded."}</div>
                <div style={{ borderTop: "1px solid #eeede7", marginTop: 20, paddingTop: 16 }}>
                  <strong>Schedule profile deactivation</strong>
                  <p style={muted}>Preview affected appointments for the effective date. Resolve every listed booking before confirming deactivation.</p>
                  <label>Effective date<input type="date" style={{ ...input, maxWidth: 230 }} value={deactivationDate} onChange={(e) => { setDeactivationDate(e.target.value); setDeactivationPreview(null); }} /></label>
                  <button type="button" style={ghostButton} disabled={busy || !deactivationDate} onClick={previewDeactivation}>Preview bookings</button>
                  {deactivationPreview && <div role="status" style={{ marginTop: 12 }}>
                    {deactivationPreview.requires_resolution ? <><p>{deactivationPreview.affected_appointments.length} booking(s) need resolution:</p><ul>{deactivationPreview.affected_appointments.map((appointment) => <li key={appointment.id}>{new Date(appointment.starts_at).toLocaleString()} · <Link href="/appointments">Open appointments</Link></li>)}</ul></> : <p>No affected bookings. Deactivation can be scheduled.</p>}
                    {!deactivationPreview.requires_resolution && <button type="button" style={dangerButton} disabled={busy} onClick={deactivateProfile}>Schedule deactivation</button>}
                  </div>}
                </div>
              </>}
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

export const getServerSideProps=privatePage("staff");
