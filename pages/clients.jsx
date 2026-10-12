import { Fragment, useCallback, useEffect, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";

const panel = { background: "#ffffff", border: "1px solid #e8e6df", borderRadius: 14, padding: 20, marginBottom: 18 };
const muted = { color: "#747970", fontSize: 13 };
const input = { display: "block", width: "100%", boxSizing: "border-box", marginTop: 6, padding: 10, border: "1px solid #c9c6bd", borderRadius: 7 };
const button = { padding: "10px 16px", background: "#334b39", color: "#fff", border: 0, borderRadius: 8, cursor: "pointer" };
const ghostButton = { ...button, background: "#e8eee4", color: "#2c3f31" };
const select = { ...input, maxWidth: 200 };

function errorText(payload, fallback) {
  const detail = payload?.detail;
  if (typeof detail === "string") return detail;
  if (detail?.code) return detail.code.replace(/_/g, " ");
  if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg;
  return fallback;
}

export default function Clients() {
  const router = useRouter();
  const [tenantId, setTenantId] = useState("");
  const [selected, setSelected] = useState(null);
  const [notice, setNotice] = useState(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLifecycle, setSearchLifecycle] = useState("");
  const [searchSource, setSearchSource] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchLimit, setSearchLimit] = useState(20);
  const [searchOffset, setSearchOffset] = useState(0);

  // Timeline state
  const [timeline, setTimeline] = useState([]);
  const [timelineTotal, setTimelineTotal] = useState(0);
  const [timelineLimit, setTimelineLimit] = useState(20);
  const [timelineOffset, setTimelineOffset] = useState(0);

  // Field Definitions state
  const [fieldDefs, setFieldDefs] = useState([]);
  const [fieldDefsTotal, setFieldDefsTotal] = useState(0);
  const [fieldDefsOffset, setFieldDefsOffset] = useState(0);
  const [fieldDefsLimit, setFieldDefsLimit] = useState(20);

  // Field Values state (per client)
  const [fieldValues, setFieldValues] = useState([]);
  const [fieldValuesTotal, setFieldValuesTotal] = useState(0);
  const [fieldValuesOffset, setFieldValuesOffset] = useState(0);
  const [fieldValuesLimit, setFieldValuesLimit] = useState(20);

  // Visit Notes state (per client)
  const [visitNotes, setVisitNotes] = useState([]);
  const [visitNotesTotal, setVisitNotesTotal] = useState(0);
  const [visitNotesOffset, setVisitNotesOffset] = useState(0);
  const [visitNotesLimit, setVisitNotesLimit] = useState(20);

  // Preferences state (per client)
  const [preferences, setPreferences] = useState([]);
  const [preferencesTotal, setPreferencesTotal] = useState(0);
  const [preferencesOffset, setPreferencesOffset] = useState(0);
  const [preferencesLimit, setPreferencesLimit] = useState(20);

  // Import state (tenant-level)
  const [imports, setImports] = useState([]);
  const [importsTotal, setImportsTotal] = useState(0);
  const [importPreview, setImportPreview] = useState(null);
  const [importRows, setImportRows] = useState([]);
  const [importRowsTotal, setImportRowsTotal] = useState(0);

  const url = useCallback(
    (params = {}) => `/api/clients?${new URLSearchParams({ tenant_id: tenantId, ...params })}`,
    [tenantId],
  );

  useEffect(() => {
    if (router.isReady && router.query.tenant) setTenantId(String(router.query.tenant));
  }, [router.isReady, router.query.tenant]);

  useEffect(() => {
    if (router.isReady && router.query.client) setSelected({ id: String(router.query.client), contacts: [] });
  }, [router.isReady, router.query.client]);

  const load = useCallback(async (clientId) => {
    if (!tenantId || !clientId) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(url({ client_id: clientId }), { credentials: "include" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(errorText(payload, "That client could not be loaded."));
        return;
      }
      setSelected(payload);
      setNotice(null);
    } catch {
      setError("The clients service is unavailable.");
    } finally { setBusy(false); }
  }, [tenantId, url]);

  useEffect(() => { if (selected?.id) load(selected.id); }, [selected?.id, load]);

  const loadSearch = useCallback(async (offset = 0) => {
    if (!tenantId) return;
    setBusy(true); setError("");
    try {
      const params = { limit: searchLimit, offset };
      if (searchQuery) params.q = searchQuery;
      if (searchLifecycle) params.lifecycle = searchLifecycle;
      if (searchSource) params.source = searchSource;
      const response = await fetch(url(params), { credentials: "include" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorText(payload, "Search failed."));
      setSearchResults(payload.items);
      setSearchTotal(payload.total);
      setSearchOffset(payload.offset);
    } catch (err) {
      setError(err.message || "Search failed.");
    } finally { setBusy(false); }
  }, [tenantId, url, searchQuery, searchLifecycle, searchSource, searchLimit]);

  const loadTimeline = useCallback(async (offset = 0) => {
    if (!tenantId || !selected?.id) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(url({ client_id: selected.id, resource: "timeline", limit: timelineLimit, offset }), { credentials: "include" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorText(payload, "Timeline failed."));
      setTimeline(payload.items);
      setTimelineTotal(payload.total);
      setTimelineOffset(payload.offset);
    } catch (err) {
      setError(err.message || "Timeline failed.");
    } finally { setBusy(false); }
  }, [tenantId, url, selected?.id, timelineLimit]);

  useEffect(() => {
    if (selected?.id) {
      loadTimeline(0);
    } else {
      setTimeline([]);
      setTimelineTotal(0);
    }
  }, [selected?.id, loadTimeline]);

  const loadFieldDefs = useCallback(async (offset = 0) => {
    if (!tenantId) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(url({ resource: "field-definitions", limit: fieldDefsLimit, offset }), { credentials: "include" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorText(payload, "Field definitions failed."));
      setFieldDefs(payload.items);
      setFieldDefsTotal(payload.total);
      setFieldDefsOffset(payload.offset);
    } catch (err) {
      setError(err.message || "Field definitions failed.");
    } finally { setBusy(false); }
  }, [tenantId, url, fieldDefsLimit]);

  const loadFieldValues = useCallback(async (offset = 0) => {
    if (!tenantId || !selected?.id) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(url({ client_id: selected.id, resource: "field-values", limit: fieldValuesLimit, offset }), { credentials: "include" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorText(payload, "Field values failed."));
      setFieldValues(payload.items);
      setFieldValuesTotal(payload.total);
      setFieldValuesOffset(payload.offset);
    } catch (err) {
      setError(err.message || "Field values failed.");
    } finally { setBusy(false); }
  }, [tenantId, url, selected?.id, fieldValuesLimit]);

  const loadVisitNotes = useCallback(async (offset = 0) => {
    if (!tenantId || !selected?.id) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(url({ client_id: selected.id, resource: "visit-notes", limit: visitNotesLimit, offset }), { credentials: "include" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorText(payload, "Visit notes failed."));
      setVisitNotes(payload.items);
      setVisitNotesTotal(payload.total);
      setVisitNotesOffset(payload.offset);
    } catch (err) {
      setError(err.message || "Visit notes failed.");
    } finally { setBusy(false); }
  }, [tenantId, url, selected?.id, visitNotesLimit]);

  const loadPreferences = useCallback(async (offset = 0) => {
    if (!tenantId || !selected?.id) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(url({ client_id: selected.id, resource: "preferences", limit: preferencesLimit, offset }), { credentials: "include" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorText(payload, "Preferences failed."));
      setPreferences(payload.items);
      setPreferencesTotal(payload.total);
      setPreferencesOffset(payload.offset);
    } catch (err) {
      setError(err.message || "Preferences failed.");
    } finally { setBusy(false); }
  }, [tenantId, url, selected?.id, preferencesLimit]);

  const loadImports = useCallback(async () => {
    if (!tenantId) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(url({ resource: "imports" }), { credentials: "include" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorText(payload, "Imports failed."));
      setImports(payload.items);
      setImportsTotal(payload.total);
    } catch (err) {
      setError(err.message || "Imports failed.");
    } finally { setBusy(false); }
  }, [tenantId, url]);

  const loadImportRows = useCallback(async (importId, statusFilter = "") => {
    if (!tenantId || !importId) return;
    setBusy(true); setError("");
    try {
      const params = { resource: "imports", import_id: importId, import_action: "rows", limit: 50, offset: 0 };
      if (statusFilter) params.status = statusFilter;
      const response = await fetch(url(params), { credentials: "include" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorText(payload, "Import rows failed."));
      setImportRows(payload.items);
      setImportRowsTotal(payload.total);
    } catch (err) {
      setError(err.message || "Import rows failed.");
    } finally { setBusy(false); }
  }, [tenantId, url]);

  useEffect(() => {
    if (selected?.id) {
      loadTimeline(0);
      loadFieldValues(0);
      loadVisitNotes(0);
      loadPreferences(0);
    } else {
      setTimeline([]);
      setTimelineTotal(0);
      setFieldValues([]);
      setFieldValuesTotal(0);
      setVisitNotes([]);
      setVisitNotesTotal(0);
      setPreferences([]);
      setPreferencesTotal(0);
    }
  }, [selected?.id, loadTimeline, loadFieldValues, loadVisitNotes, loadPreferences]);

  useEffect(() => { loadFieldDefs(0); }, [tenantId, loadFieldDefs]);

  async function send(path, method, body, okMessage) {
    setBusy(true); setError(""); setStatus("");
    try {
      const response = await fetch(url(path), {
        method, credentials: "include",
        ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorText(payload, "That change could not be saved."));
      setStatus(okMessage);
      if (payload?.id) setSelected(payload);
      else if (selected?.id) await load(selected.id);
      return payload;
    } catch (err) {
      setError(err.message || "That change could not be saved.");
    } finally { setBusy(false); }
  }

  const createClient = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const contacts = [];
    const phone = String(form.get("phone") || "").trim();
    const email = String(form.get("email") || "").trim();
    if (phone) contacts.push({ kind: "phone", value: phone });
    if (email) contacts.push({ kind: "email", value: email });
    const created = await send({}, "POST", { name: form.get("name"), contacts }, "Client created.");
    if (created) {
      setNotice(created.duplicate_candidates
        ? `${created.duplicate_candidates} client(s) already use one of these contact details. Review the duplicate candidates — nothing was merged.`
        : null);
      loadSearch(0);
    }
  };

  const addContact = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await send({ client_id: selected.id, resource: "contacts" }, "POST",
      { kind: form.get("kind"), value: form.get("value") }, "Contact added.");
  };

  const setVerification = (contact, verification) =>
    send({ client_id: selected.id, resource: "contacts", contact_id: contact.id },
      "PATCH", { verification }, `Contact marked ${verification.replace(/_/g, " ")}.`);

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    loadSearch(0);
  };

  // TASK-011: typed field values are built from the definition the form selects, so the
  // payload carries the one value column the server validates against.
  const applyFieldValue = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const definitionId = String(form.get("fv_definition") || "");
    const definition = fieldDefs.find((fd) => fd.id === definitionId);
    if (!definition) { setError("Choose a field before setting a value."); return; }
    const raw = String(form.get("fv_value") || "");
    const body = { definition_id: definitionId, entity_type: "client", entity_id: selected.id };
    if (definition.type === "number") {
      if (raw === "" || Number.isNaN(Number(raw))) { setError("Enter a number for this field."); return; }
      body.value_number = Number(raw);
    } else if (definition.type === "boolean") {
      if (raw !== "true" && raw !== "false") { setError("Choose true or false for this field."); return; }
      body.value_boolean = raw === "true";
    } else if (definition.type === "date") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) { setError("Enter a date as YYYY-MM-DD."); return; }
      body.value_date = raw;
    } else {
      if (raw === "") { setError("Enter a value for this field."); return; }
      body.value_text = raw;
    }
    const saved = await send({ client_id: selected.id, resource: "field-values" }, "POST", body, "Field value saved.");
    if (saved) loadFieldValues(0);
  };

  const addVisitNote = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const saved = await send({ client_id: selected.id, resource: "visit-notes" }, "POST",
      { class: form.get("vn_class"), visibility: form.get("vn_visibility"), body: form.get("vn_body") },
      "Visit note added.");
    if (saved) { event.currentTarget.reset(); loadVisitNotes(0); }
  };

  const addPreference = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    let valueJson;
    try {
      valueJson = JSON.parse(String(form.get("pref_value") || ""));
    } catch {
      setError("Preference value must be valid JSON.");
      return;
    }
    if (!valueJson || typeof valueJson !== "object" || Array.isArray(valueJson)) {
      setError("Preference value must be a JSON object.");
      return;
    }
    const saved = await send({ client_id: selected.id, resource: "preferences" }, "POST",
      { preference_type: form.get("pref_type"), value_json: valueJson, source: form.get("pref_source") },
      "Preference added.");
    if (saved) { event.currentTarget.reset(); loadPreferences(0); }
  };

  const createFieldDefinition = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const type = String(form.get("fd_type"));
    const validationRaw = String(form.get("fd_validation") || "").trim();
    let validation = {};
    if (validationRaw) {
      try {
        validation = JSON.parse(validationRaw);
      } catch {
        setError("Validation rules must be valid JSON.");
        return;
      }
    }
    const saved = await send({ resource: "field-definitions" }, "POST", {
      entity_type: "client",
      key: String(form.get("fd_key") || "").trim(),
      label: String(form.get("fd_label") || "").trim(),
      type,
      validation,
      purpose: String(form.get("fd_purpose") || "").trim() || `Custom field ${type}`,
      sensitivity: form.get("fd_sensitivity"),
    }, "Field definition created.");
    if (saved) { event.currentTarget.reset(); loadFieldDefs(0); }
  };

  // TASK-012 import. The preview is a dry run: nothing is created until commit.
  const previewImport = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("import_file");
    if (!file || typeof file === "string") { setError("Choose a CSV file to preview."); return; }
    const mapping = {};
    for (const [target, column] of [["name", "name"], ["email", "email"], ["phone", "phone"],
                                    ["preferred_name", "preferred_name"], ["consent_proof", "consent_proof"]]) {
      const chosen = String(form.get(`map_${target}`) || "").trim();
      if (chosen) mapping[target] = chosen;
    }
    if (!mapping.name) { setError("Map at least the name column."); return; }
    setBusy(true); setError(""); setStatus("");
    try {
      const content = await file.text();
      const response = await fetch(url({ resource: "imports", import_action: "preview" }), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, content, mapping }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorText(payload, "Preview failed."));
      setImportPreview(payload);
      setStatus(`Preview: ${payload.valid_rows} valid, ${payload.error_rows} error(s), ${payload.duplicate_rows} duplicate candidate(s).`);
      loadImportRows(payload.id);
    } catch (err) {
      setError(err.message || "Preview failed.");
    } finally { setBusy(false); }
  };

  const commitImport = async (importId, version) => {
    const key = `commit-${importId}-${Date.now()}`;
    const saved = await send({ resource: "imports", import_id: importId, import_action: "commit" },
      "POST", { expected_version: version, idempotency_key: key }, "Import committed.");
    if (saved) { loadImports(); loadImportRows(importId); loadSearch(0); }
  };

  const recordConsent = async (importId, rowNumber) => {
    const proof = window.prompt("Consent proof reference (e.g. signed form, date):");
    if (!proof) return;
    const saved = await send({ resource: "imports", import_id: importId, import_action: "consent", row_number: rowNumber },
      "PATCH", { consent_proof: proof, marketing_eligible: true }, "Consent recorded.");
    if (saved) loadImportRows(importId);
  };

  useEffect(() => { if (tenantId) loadImports(); }, [tenantId, loadImports]);

  const formatDate = (iso) => new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });

  return (
    <div style={{ minHeight: "100vh", background: "#f5f3ef", color: "#20231f", fontFamily: "Inter, system-ui, sans-serif" }}>
      <Head><title>Clients · Salon Operations</title></Head>
      <main style={{ padding: "38px 5vw", maxWidth: 1040, margin: "0 auto" }}>
        <header style={{ marginBottom: 24 }}>
          <div style={muted}>Client records</div>
          <h1 style={{ margin: "6px 0", fontSize: 30 }}>Clients</h1>
          <p style={muted}>Reusable profiles with their own contact details, kept separate from each other and from any other salon.</p>
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
        {status && <p role="status" aria-live="polite" style={{ ...panel, color: "#2c3f31" }}>{status}</p>}
        {notice && <p style={{ ...panel, color: "#8a5a1f" }}>{notice}</p>}

        {!tenantId ? (
          <p style={muted}>Enter your workspace id to manage clients.</p>
        ) : (
          <div>
            <section style={panel}>
              <h2 style={{ fontSize: 17, margin: "0 0 4px" }}>Search clients</h2>
              <form onSubmit={handleSearchSubmit} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginTop: 14 }}>
                <label style={{ maxWidth: 320, flex: 1 }}>Search name or contact
                  <input style={input} name="q" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Type to search…" maxLength={120} />
                </label>
                <label style={{ maxWidth: 180 }}>Lifecycle
                  <select style={select} value={searchLifecycle} onChange={(e) => setSearchLifecycle(e.target.value)}>
                    <option value="">All</option>
                    <option value="lead">Lead</option>
                    <option value="active">Active</option>
                    <option value="lapsed">Lapsed</option>
                    <option value="archived">Archived</option>
                  </select>
                </label>
                <label style={{ maxWidth: 180 }}>Source
                  <select style={select} value={searchSource} onChange={(e) => setSearchSource(e.target.value)}>
                    <option value="">All</option>
                    <option value="staff">Staff</option>
                    <option value="public_booking">Public booking</option>
                    <option value="import">Import</option>
                  </select>
                </label>
                <button type="submit" style={button} disabled={busy}>{busy ? "Searching…" : "Search"}</button>
                {searchQuery || searchLifecycle || searchSource ? (
                  <button type="button" style={ghostButton} onClick={() => { setSearchQuery(""); setSearchLifecycle(""); setSearchSource(""); loadSearch(0); }} disabled={busy}>
                    Clear
                  </button>
                ) : null}
              </form>

              {searchResults.length === 0 && searchTotal === 0 && (searchQuery || searchLifecycle || searchSource) ? (
                <p style={muted}>No clients match your search.</p>
              ) : (searchResults.length > 0 ? (
                <div>
                  <ul style={{ listStyle: "none", padding: 0, marginTop: 14 }}>
                    {searchResults.map((c) => (
                      <li key={c.id} style={{ borderBottom: "1px solid #efece5", padding: "12px 0" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                          <div style={{ flex: 1 }}>
                            <strong>{c.name}</strong>{c.preferred_name ? ` ({c.preferred_name})` : ""}
                            <div style={{ ...muted, marginTop: 4 }}>
                              Version {c.version} · {c.source}
                              {c.lifecycle ? ` · ${c.lifecycle}` : ""}
                              {c.preferred_location_id ? ` · Location {c.preferred_location_id}` : ""}
                            </div>
                          </div>
                          <button type="button" style={ghostButton} onClick={() => setSelected(c)} disabled={busy}>
                            View
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, flexWrap: "wrap", gap: 8 }}>
                    <p style={muted}>Showing {searchOffset + 1}–{Math.min(searchOffset + searchResults.length, searchTotal)} of {searchTotal}</p>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button type="button" style={ghostButton} onClick={() => loadSearch(Math.max(0, searchOffset - searchLimit))} disabled={busy || searchOffset === 0}>Previous</button>
                      <button type="button" style={ghostButton} onClick={() => loadSearch(searchOffset + searchLimit)} disabled={busy || searchOffset + searchResults.length >= searchTotal}>Next</button>
                    </div>
                  </div>
                </div>) : null)}
            </section>

            <section style={panel}>
              <h2 style={{ fontSize: 17, margin: "0 0 4px" }}>Add a client</h2>
              <p style={{ ...muted, marginTop: 0 }}>
                A phone or email is optional for a client you create at the desk. What you type is kept
                as written; the stored copy is normalized for lookups.
              </p>
              <form onSubmit={createClient} style={{ display: "grid", gap: 14, marginTop: 14 }}>
                <label style={{ maxWidth: 420 }}>Full name<input style={input} name="name" required maxLength={120} /></label>
                <label style={{ maxWidth: 260 }}>Phone<input style={input} name="phone" maxLength={320} placeholder="(416) 555-0134" /></label>
                <label style={{ maxWidth: 320 }}>Email<input style={input} name="email" type="email" maxLength={320} placeholder="client@example.com" /></label>
                <div><button type="submit" style={button} disabled={busy}>{busy ? "Saving…" : "Create client"}</button></div>
              </form>
            </section>

            <section style={panel}>
              <h2 style={{ fontSize: 17, margin: "0 0 4px" }}>Import clients from CSV</h2>
              <p style={{ ...muted, marginTop: 0 }}>
                Map your columns, preview the result, then commit. A row without recorded consent
                proof is imported but stays ineligible for marketing — nothing is ever auto-merged.
              </p>
              <form onSubmit={previewImport} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginTop: 14 }}>
                <label style={{ maxWidth: 260, flex: 1 }}>CSV file
                  <input style={input} type="file" name="import_file" accept=".csv,text/csv" required />
                </label>
                <label style={{ maxWidth: 140 }}>name column
                  <input style={input} name="map_name" defaultValue="name" maxLength={80} />
                </label>
                <label style={{ maxWidth: 140 }}>email column
                  <input style={input} name="map_email" defaultValue="email" maxLength={80} />
                </label>
                <label style={{ maxWidth: 140 }}>phone column
                  <input style={input} name="map_phone" defaultValue="phone" maxLength={80} />
                </label>
                <label style={{ maxWidth: 160 }}>consent proof column
                  <input style={input} name="map_consent_proof" maxLength={80} placeholder="optional" />
                </label>
                <button type="submit" style={button} disabled={busy}>{busy ? "Reading..." : "Preview import"}</button>
              </form>

              {importPreview && (
                <div style={{ marginTop: 16 }}>
                  <p style={muted}>
                    <strong>{importPreview.filename}</strong> · {importPreview.valid_rows} valid ·{" "}
                    {importPreview.error_rows} error(s) · {importPreview.duplicate_rows} duplicate candidate(s)
                  </p>
                  <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                    <button type="button" style={button} disabled={busy || importPreview.valid_rows === 0}
                      onClick={() => commitImport(importPreview.id, importPreview.version)}>
                      Commit {importPreview.valid_rows} valid row(s)
                    </button>
                    <button type="button" style={ghostButton} disabled={busy} onClick={() => loadImportRows(importPreview.id, "error")}>Show errors</button>
                    <button type="button" style={ghostButton} disabled={busy} onClick={() => loadImportRows(importPreview.id)}>Show all rows</button>
                  </div>
                  <p style={{ ...muted, marginTop: 0 }}>Showing {importRows.length} of {importRowsTotal} staged row(s).</p>
                  <ul style={{ listStyle: "none", padding: 0 }}>
                    {importRows.map((row) => (
                      <li key={row.row_number} style={{ borderBottom: "1px solid #efece5", padding: "10px 0" }}>
                        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 600 }}>Row {row.row_number}</span>
                          <span style={muted}>{row.status}</span>
                          <span style={{ ...muted, fontFamily: "monospace", fontSize: 12 }}>
                            {(row.normalized && row.normalized.name) || "—"}
                          </span>
                          {row.error_codes && row.error_codes.length > 0 && (
                            <span style={{ color: "#8c2626", fontSize: 12 }}>{row.error_codes.join(", ")}</span>
                          )}
                          {row.status === "committed" && !row.marketing_eligible && (
                            <button type="button" style={{ ...ghostButton, padding: "3px 8px", fontSize: 12 }}
                              disabled={busy} onClick={() => recordConsent(importPreview.id, row.row_number)}>
                              Record consent proof
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {imports.length > 0 && (
                <details style={{ marginTop: 14 }}>
                  <summary style={muted}>Previous imports ({importsTotal})</summary>
                  <ul style={{ listStyle: "none", padding: 0 }}>
                    {imports.map((item) => (
                      <li key={item.id} style={{ borderBottom: "1px solid #efece5", padding: "10px 0" }}>
                        <span style={{ fontWeight: 600 }}>{item.filename}</span>
                        <span style={muted}> · {item.status} · {item.committed_rows} committed · {item.error_rows} error(s)</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </section>

            {selected && (
              <section style={panel}>
                <h2 style={{ fontSize: 17, margin: "0 0 10px" }}>Client record</h2>
                {selected.name && <p style={{ margin: "0 0 4px" }}><strong>{selected.name}</strong>{selected.preferred_name ? ` ({selected.preferred_name})` : ""}</p>}
                <p style={{ ...muted, margin: "0 0 12px" }}>
                  Version {selected.version} · Source {selected.source || "unknown"}
                  {selected.lifecycle ? ` · ${selected.lifecycle}` : ""}
                </p>

                <h3 style={{ fontSize: 15, margin: "0 0 8px" }}>Contacts</h3>
                {(selected.contacts || []).length === 0 ? <p style={muted}>No contact details yet.</p> : (
                  <ul style={{ margin: "0 0 16px", paddingLeft: 20 }}>
                    {selected.contacts.map((contact) => (
                      <li key={contact.id} style={{ marginBottom: 8 }}>
                        {contact.display_value}
                        <small style={{ ...muted, marginLeft: 8 }}>
                          {contact.kind} · {contact.is_primary ? "primary" : "secondary"} ·
                          {" "}{contact.verification.replace(/_/g, " ")}
                        </small>
                        {contact.verification !== "verified" && (
                          <button type="button" style={{ ...ghostButton, padding: "3px 8px", marginLeft: 8, fontSize: 12 }}
                            disabled={busy} onClick={() => setVerification(contact, "verified")}>
                            Mark verified
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                <form onSubmit={addContact} style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
                  <label style={{ maxWidth: 160 }}>Type
                    <select style={input} name="kind" defaultValue="phone">
                      <option value="phone">Phone</option>
                      <option value="email">Email</option>
                    </select>
                  </label>
                  <label style={{ maxWidth: 320, flex: 1 }}>Value
                    <input style={input} name="value" required maxLength={320} />
                  </label>
                  <button type="submit" style={ghostButton} disabled={busy}>{busy ? "Working…" : "Add contact"}</button>
                </form>
                <p style={{ ...muted, marginTop: 10 }}>
                  Adding a contact that another client already uses raises a duplicate candidate for review.
                  Nothing is ever merged automatically.
                </p>

<h3 style={{ fontSize: 15, margin: "20px 0 8px" }}>Activity timeline</h3>
                {timeline.length === 0 && timelineTotal === 0 ? (
                  <p style={muted}>No activity recorded yet.</p>
                ) : (
                  <Fragment>
                    <ul style={{ listStyle: "none", padding: 0 }}>
                      {timeline.map((entry, idx) => (
                        <li key={`${entry.source.id}-${idx}`} style={{ borderBottom: "1px solid #efece5", padding: "12px 0" }}>
                          <div style={{ display: "flex", gap: 12, marginBottom: 4 }}>
                            <span style={{ fontWeight: 600 }}>{entry.action.replace(/_/g, " ")}</span>
                            <span style={muted}>{formatDate(entry.occurred_at)}</span>
                            <span style={{ ...muted, fontFamily: "monospace", fontSize: 11 }}>
                              {entry.source.type} · {entry.source.id.slice(0, 8)}…
                            </span>
                          </div>
                          <div style={{ ...muted, fontSize: 13 }}>
                            {entry.reason}
                            {entry.changed_fields && entry.changed_fields.length > 0 && (
                              <span style={{ marginLeft: 8 }}>Fields: {entry.changed_fields.join(", ")}</span>
                            )}
                            <span style={{ marginLeft: 8 }}>Actor: {entry.actor.subject}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, flexWrap: "wrap", gap: 8 }}>
                      <p style={muted}>Showing {timelineOffset + 1}–{Math.min(timelineOffset + timeline.length, timelineTotal)} of {timelineTotal}</p>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button type="button" style={ghostButton} onClick={() => loadTimeline(Math.max(0, timelineOffset - timelineLimit))} disabled={busy || timelineOffset === 0}>Previous</button>
                        <button type="button" style={ghostButton} onClick={() => loadTimeline(timelineOffset + timelineLimit)} disabled={busy || timelineOffset + timeline.length >= timelineTotal}>Next</button>
                      </div>
                    </div>
                  </Fragment>
                 )}
              </section>
            )}

            {selected && (
              <section style={panel}>
                <h2 style={{ fontSize: 17, margin: "0 0 4px" }}>Custom Field Definitions</h2>
                <p style={{ ...muted, marginTop: 0 }}>
                  Define typed custom fields (text, number, date, boolean, enum) with validation and sensitivity.
                </p>
<form onSubmit={createFieldDefinition} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginTop: 14 }}>
                  <label style={{ maxWidth: 200 }}>Key
                    <input style={input} name="fd_key" required placeholder="snake_case_key" maxLength={64} pattern="[a-z_][a-z0-9_]*" />
                  </label>
                  <label style={{ maxWidth: 200 }}>Label
                    <input style={input} name="fd_label" required placeholder="Display Label" maxLength={120} />
                  </label>
                  <label style={{ maxWidth: 140 }}>Type
                    <select style={select} name="fd_type" defaultValue="text">
                      <option value="text">Text</option>
                      <option value="number">Number</option>
                      <option value="date">Date</option>
                      <option value="boolean">Boolean</option>
                      <option value="enum">Enum</option>
                    </select>
                  </label>
                  <label style={{ maxWidth: 140 }}>Sensitivity
                    <select style={select} name="fd_sensitivity" defaultValue="standard">
                      <option value="standard">Standard</option>
                      <option value="private">Private</option>
                      <option value="restricted">Restricted</option>
                    </select>
                  </label>
                  <label style={{ maxWidth: 320, flex: 1 }}>Validation (JSON)
                    <input style={input} name="fd_validation" placeholder='{"max_length": 200} or {"values": ["a","b"]}' maxLength={2000} />
                  </label>
                  <label style={{ maxWidth: 320, flex: 1 }}>Purpose
                    <input style={input} name="fd_purpose" required placeholder="Why this field exists" maxLength={240} />
                  </label>
                  <button type="submit" style={button} disabled={busy}>{busy ? "Creating..." : "Create field"}</button>
                </form>

                {fieldDefs.length === 0 && fieldDefsTotal === 0 ? (
                  <p style={muted}>No field definitions yet.</p>
                ) : (
                  <Fragment>
                    <ul style={{ listStyle: "none", padding: 0, marginTop: 14 }}>
                      {fieldDefs.map((fd) => {
                      const hasValidation = fd.validation && Object.keys(fd.validation).length > 0;
                      const validationDisplay = hasValidation ? (
                        <span> · Validation: {JSON.stringify(fd.validation)}</span>
                      ) : null;
                      return (
                        <li key={fd.id} style={{ borderBottom: "1px solid #efece5", padding: "12px 0" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                            <div style={{ flex: 1 }}>
                              <strong>{fd.key}</strong> — {fd.label}
                              <div style={{ ...muted, marginTop: 4 }}>
                                Type: {fd.type} · Sensitivity: {fd.sensitivity}
                                {validationDisplay}
                              </div>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                    </ul>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, flexWrap: "wrap", gap: 8 }}>
                      <p style={muted}>Showing {fieldDefsOffset + 1}–{Math.min(fieldDefsOffset + fieldDefs.length, fieldDefsTotal)} of {fieldDefsTotal}</p>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button type="button" style={ghostButton} onClick={() => loadFieldDefs(Math.max(0, fieldDefsOffset - fieldDefsLimit))} disabled={busy || fieldDefsOffset === 0}>Previous</button>
                        <button type="button" style={ghostButton} onClick={() => loadFieldDefs(fieldDefsOffset + fieldDefsLimit)} disabled={busy || fieldDefsOffset + fieldDefs.length >= fieldDefsTotal}>Next</button>
                      </div>
                    </div>
                  </Fragment>
                 )}
              </section>
            )}

            {selected && (
              <section style={panel}>
                <h2 style={{ fontSize: 17, margin: "0 0 4px" }}>Custom Field Values</h2>
                <p style={{ ...muted, marginTop: 0 }}>
                  Set typed values for this client's custom fields. Validation is enforced per field definition.
                </p>
                {fieldDefs.length === 0 ? (
                  <p style={muted}>Create a field definition above before setting values.</p>
                ) : (
                  <form onSubmit={applyFieldValue} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginTop: 14 }}>
                    <label style={{ maxWidth: 240 }}>Field
                      <select style={select} name="fv_definition" defaultValue={fieldDefs[0]?.id || ""}>
                        {fieldDefs.map((fd) => <option key={fd.id} value={fd.id}>{fd.label} ({fd.type})</option>)}
                      </select>
                    </label>
                    <label style={{ maxWidth: 320, flex: 1 }}>Value
                      <input style={input} name="fv_value" required maxLength={2000} />
                    </label>
                    <button type="submit" style={button} disabled={busy}>{busy ? "Saving..." : "Save value"}</button>
                  </form>
                )}
                {fieldValues.length === 0 && fieldValuesTotal === 0 ? (
                  <p style={muted}>No custom field values set for this client.</p>
                ) : (
                  <Fragment>
                    <ul style={{ listStyle: "none", padding: 0, marginTop: 14 }}>
                      {fieldValues.map((fv) => {
                        const hasValidation = fv.validation && Object.keys(fv.validation).length > 0;
                        const validationDisplay = hasValidation ? (
                          <span>Validation: {JSON.stringify(fv.validation)}</span>
                        ) : null;
                        return (
                          <li key={fv.id} style={{ borderBottom: "1px solid #efece5", padding: "12px 0" }}>
                            <div style={{ display: "flex", gap: 12, marginBottom: 4 }}>
                              <span style={{ fontWeight: 600 }}>{fv.key}</span>
                              <span style={muted}>Type: {fv.type}</span>
                              <span style={{ ...muted, fontFamily: "monospace", fontSize: 11 }}>
                                Value: {fv.value_text ?? fv.value_number ?? fv.value_date ?? (fv.value_boolean !== undefined ? String(fv.value_boolean) : "—")}
                              </span>
                            </div>
                            <div style={{ ...muted, fontSize: 13 }}>
                              {validationDisplay}
                              <span style={{ marginLeft: 8 }}>Sensitivity: {fv.sensitivity}</span>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, flexWrap: "wrap", gap: 8 }}>
                      <p style={muted}>Showing {fieldValuesOffset + 1}–{Math.min(fieldValuesOffset + fieldValues.length, fieldValuesTotal)} of {fieldValuesTotal}</p>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button type="button" style={ghostButton} onClick={() => loadFieldValues(Math.max(0, fieldValuesOffset - fieldValuesLimit))} disabled={busy || fieldValuesOffset === 0}>Previous</button>
                        <button type="button" style={ghostButton} onClick={() => loadFieldValues(fieldValuesOffset + fieldValuesLimit)} disabled={busy || fieldValuesOffset + fieldValues.length >= fieldValuesTotal}>Next</button>
                      </div>
                    </div>
                  </Fragment>
                 )}
              </section>
            )}

            {selected && (
              <section style={panel}>
                <h2 style={{ fontSize: 17, margin: "0 0 4px" }}>Visit Notes</h2>
                <p style={{ ...muted, marginTop: 0 }}>
                  Structured visit notes with visibility control. Private notes require sensitive permission.
                </p>
                <form onSubmit={addVisitNote} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginTop: 14 }}>
                  <label style={{ maxWidth: 140 }}>Class
                    <select style={select} name="vn_class" defaultValue="general">
                      <option value="general">General</option>
                      <option value="clinical">Clinical</option>
                      <option value="allergy">Allergy</option>
                      <option value="preference">Preference</option>
                    </select>
                  </label>
                  <label style={{ maxWidth: 140 }}>Visibility
                    <select style={select} name="vn_visibility" defaultValue="standard">
                      <option value="standard">Standard</option>
                      <option value="private">Private</option>
                    </select>
                  </label>
                  <label style={{ maxWidth: 320, flex: 1 }}>Body
                    <input style={input} name="vn_body" required maxLength={8000} placeholder="Note details…" />
                  </label>
                  <button type="submit" style={button} disabled={busy}>{busy ? "Creating…" : "Add note"}</button>
                </form>

                {visitNotes.length === 0 && visitNotesTotal === 0 ? (
                  <p style={muted}>No visit notes yet.</p>
                ) : (
                  <Fragment>
                    <ul style={{ listStyle: "none", padding: 0, marginTop: 14 }}>
                      {visitNotes.map((note, idx) => {
                        const visibilityIcon = note.visibility === "private" ? "🔒 Private" : "👁 Standard";
                        const noteDate = note.occurred_at || note.created_at;
                        return (
                          <li key={`${note.id}-${idx}`} style={{ borderBottom: "1px solid #efece5", padding: "12px 0" }}>
                            <div style={{ display: "flex", gap: 12, marginBottom: 4 }}>
                              <span style={{ fontWeight: 600 }}>{note.class}</span>
                              <span style={muted}>{formatDate(noteDate)}</span>
                              <span style={{ ...muted, fontFamily: "monospace", fontSize: 11 }}>
                                {visibilityIcon}
                              </span>
                            </div>
                            <div style={{ ...muted, fontSize: 13 }}>
                              {note.body}
                              {note.changed_fields && note.changed_fields.length > 0 && (
                                <span style={{ marginLeft: 8 }}>Fields: {note.changed_fields.join(", ")}</span>
                              )}
                              <span style={{ marginLeft: 8 }}>Author: {note.author_subject}</span>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, flexWrap: "wrap", gap: 8 }}>
                      <p style={muted}>Showing {visitNotesOffset + 1}–{Math.min(visitNotesOffset + visitNotes.length, visitNotesTotal)} of {visitNotesTotal}</p>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button type="button" style={ghostButton} onClick={() => loadVisitNotes(Math.max(0, visitNotesOffset - visitNotesLimit))} disabled={busy || visitNotesOffset === 0}>Previous</button>
                        <button type="button" style={ghostButton} onClick={() => loadVisitNotes(visitNotesOffset + visitNotesLimit)} disabled={busy || visitNotesOffset + visitNotes.length >= visitNotesTotal}>Next</button>
                      </div>
                    </div>
                  </Fragment>
                 )}
              </section>
            )}

            {selected && (
              <section style={panel}>
                <h2 style={{ fontSize: 17, margin: "0 0 4px" }}>Service Preferences</h2>
                <p style={{ ...muted, marginTop: 0 }}>
                  Colour formulas, stylist preferences, product choices, and other structured preferences.
                </p>
                <form onSubmit={addPreference} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginTop: 14 }}>
                  <label style={{ maxWidth: 200 }}>Type
                    <select style={select} name="pref_type" defaultValue="colour_formula">
                      <option value="colour_formula">Colour Formula</option>
                      <option value="stylist_preference">Stylist Preference</option>
                      <option value="product">Product</option>
                      <option value="rebooking_interval">Rebooking Interval</option>
                      <option value="product_allergy">Product Allergy</option>
                      <option value="sensitivity_note">Sensitivity Note</option>
                      <option value="communication_preference">Communication Preference</option>
                    </select>
                  </label>
                  <label style={{ maxWidth: 320, flex: 1 }}>Value (JSON)
                    <input style={input} name="pref_value" required maxLength={2000} placeholder='{"key": "value"}' />
                  </label>
                  <label style={{ maxWidth: 140 }}>Source
                    <select style={select} name="pref_source" defaultValue="staff">
                      <option value="staff">Staff</option>
                      <option value="client">Client</option>
                      <option value="import">Import</option>
                    </select>
                  </label>
                  <button type="submit" style={button} disabled={busy}>{busy ? "Creating…" : "Add preference"}</button>
                </form>

                {preferences.length === 0 && preferencesTotal === 0 ? (
                  <p style={muted}>No preferences recorded yet.</p>
                ) : (
                  <Fragment>
                    <ul style={{ listStyle: "none", padding: 0, marginTop: 14 }}>
                      {preferences.map((pref, idx) => (
                        <li key={`${pref.id}-${idx}`} style={{ borderBottom: "1px solid #efece5", padding: "12px 0" }}>
                          <div style={{ display: "flex", gap: 12, marginBottom: 4 }}>
                            <span style={{ fontWeight: 600 }}>{pref.preference_type}</span>
                            <span style={muted}>{formatDate(pref.updated_at || pref.created_at)}</span>
                            <span style={muted}>Source: {pref.source}</span>
                          </div>
                          <div style={{ ...muted, fontSize: 13, fontFamily: "monospace" }}>
                            {JSON.stringify(pref.value_json)}
                          </div>
                        </li>
                      ))}
                    </ul>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, flexWrap: "wrap", gap: 8 }}>
                      <p style={muted}>Showing {preferencesOffset + 1}–{Math.min(preferencesOffset + preferences.length, preferencesTotal)} of {preferencesTotal}</p>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button type="button" style={ghostButton} onClick={() => loadPreferences(Math.max(0, preferencesOffset - preferencesLimit))} disabled={busy || preferencesOffset === 0}>Previous</button>
                        <button type="button" style={ghostButton} onClick={() => loadPreferences(preferencesOffset + preferencesLimit)} disabled={busy || preferencesOffset + preferences.length >= preferencesTotal}>Next</button>
                      </div>
                    </div>
                  </Fragment>
                 )}
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}