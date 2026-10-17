import {useWorkspace} from "../components/Workspace";
import {privatePage} from "../lib/session";
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
  const {tenantId, setTenantId} = useWorkspace();
  const [selected, setSelected] = useState(null);
  const [mergePreview, setMergePreview] = useState(null);
  const [mergeAcknowledged, setMergeAcknowledged] = useState(false);
  const [notice, setNotice] = useState(null);
  const [locations, setLocations] = useState([]);
  const [clientLocation, setClientLocation] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [privacyType, setPrivacyType] = useState("export");
  const [privacyVerification, setPrivacyVerification] = useState("");
  const [privacyHolds, setPrivacyHolds] = useState([]);
  const [pendingDeletionRequestId, setPendingDeletionRequestId] = useState(null);
  const [pendingDeletionRequests, setPendingDeletionRequests] = useState([]);

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
  const [importRowsOffset, setImportRowsOffset] = useState(0);

  const url = useCallback(
    (params = {}) => `/api/clients?${new URLSearchParams({ tenant_id: tenantId, ...params })}`,
    [tenantId],
  );


  useEffect(() => {
    if (router.isReady && router.query.client) setSelected({ id: String(router.query.client), contacts: [] });
  }, [router.isReady, router.query.client]);

  useEffect(() => {
    if (!tenantId) { setLocations([]); setClientLocation(""); return; }
    let current = true;
    fetch(`/api/settings?${new URLSearchParams({ tenant_id: tenantId, resource: "locations" })}`, { credentials: "include" })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(errorText(payload, "Locations could not be loaded."));
        if (current) {
          const available = payload.items || [];
          setLocations(available);
          setClientLocation(available.length === 1 ? available[0].id : "");
        }
      })
      .catch((err) => { if (current) setError(err.message || "Locations could not be loaded."); });
    return () => { current = false; };
  }, [tenantId]);

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

  useEffect(() => {
    if (!tenantId || !selected?.id) { setPrivacyHolds([]); return; }
    let active = true;
    fetch(url({ resource: "privacy", privacy_action: "holds", client_id: selected.id }), { credentials: "include" })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(errorText(payload, "Retention holds could not be loaded."));
        if (active) setPrivacyHolds(payload.items || []);
      }).catch((err) => { if (active) setError(err.message || "Retention holds could not be loaded."); });
    return () => { active = false; };
  }, [tenantId, selected?.id, url]);

  const loadPendingDeletionRequests = useCallback(async () => {
    if (!tenantId) { setPendingDeletionRequests([]); return; }
    try {
      const response = await fetch(url({ resource: "privacy", privacy_action: "requests" }), { credentials: "include" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorText(payload, "Pending privacy cleanup could not be loaded."));
      setPendingDeletionRequests((payload.items || []).filter((item) => item.cleanup_pending));
    } catch (err) { setError(err.message || "Pending privacy cleanup could not be loaded."); }
  }, [tenantId, url]);

  useEffect(() => { loadPendingDeletionRequests(); }, [loadPendingDeletionRequests]);

  const loadSearch = useCallback(async (offset = 0) => {
    if (!tenantId) return;
    setBusy(true); setError("");
    try {
      const params = { resource: "search", limit: searchLimit, offset };
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

  useEffect(() => { if (tenantId) loadSearch(0); }, [tenantId]);

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

  const loadImportRows = useCallback(async (importId, statusFilter = "", offset = 0) => {
    if (!tenantId || !importId) return;
    setBusy(true); setError("");
    try {
      const params = { resource: "imports", import_id: importId, import_action: "rows", limit: 50, offset };
      if (statusFilter) params.status = statusFilter;
      const response = await fetch(url(params), { credentials: "include" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorText(payload, "Import rows failed."));
      setImportRows(payload.items);
      setImportRowsTotal(payload.total);
      setImportRowsOffset(payload.offset);
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
      if (payload?.id && path.resource !== "imports") setSelected(payload);
      else if (selected?.id) await load(selected.id);
      return payload;
    } catch (err) {
      setError(err.message || "That change could not be saved.");
    } finally { setBusy(false); }
  }

  const createClient = async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const contacts = [];
    const phone = String(form.get("phone") || "").trim();
    const email = String(form.get("email") || "").trim();
    if (phone) contacts.push({ kind: "phone", value: phone });
    if (email) contacts.push({ kind: "email", value: email });
    const preferredLocation = String(form.get("preferred_location_id") || "");
    const created = await send({}, "POST", {
      name: form.get("name"), contacts,
      ...(preferredLocation ? { preferred_location_id: preferredLocation } : {}),
    }, "Client created.");
    if (created) {
      setNotice(created.duplicate_candidates
        ? `${created.duplicate_candidates} client(s) already use one of these contact details. Review the duplicate candidates — nothing was merged.`
        : null);
      loadSearch(0);
    }
  };

  const addContact = async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    await send({ client_id: selected.id, resource: "contacts" }, "POST",
      { kind: form.get("kind"), value: form.get("value") }, "Contact added.");
  };

  const setVerification = (contact, verification) =>
    send({ client_id: selected.id, resource: "contacts", contact_id: contact.id },
      "PATCH", { verification }, `Contact marked ${verification.replace(/_/g, " ")}.`);

  const submitPrivacyRequest = async (event) => {
    event.preventDefault();
    if (!selected?.id || privacyVerification.trim().length < 3) {
      setError("Record how the requester’s authority was verified.");
      return;
    }
    if (privacyType === "deletion" && !window.confirm("Delete this client’s supported profile, booking, communication, and attachment records? Active legal holds will block deletion.")) return;
    setBusy(true); setError("");
    try {
      const createdResponse = await fetch(url({ resource: "privacy", privacy_action: "create" }), {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: selected.id, request_type: privacyType, verification: privacyVerification.trim() }),
      });
      const created = await createdResponse.json().catch(() => null);
      if (!createdResponse.ok) throw new Error(errorText(created, "Privacy request could not be recorded."));
      if (privacyType === "export" || privacyType === "access") {
        const response = await fetch(url({ resource: "privacy", privacy_action: "export" }), {
          method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ request_id: created.id }),
        });
        const result = await response.json().catch(() => null);
        if (!response.ok) throw new Error(errorText(result, "Client export failed."));
        const file = new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(file); link.download = `client-export-${selected.id}.json`;
        link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
        setStatus("Verified export downloaded. The request and export are recorded in the audit trail.");
      } else {
        const deletionKey = crypto.randomUUID();
        const response = await fetch(url({ resource: "privacy", privacy_action: "deletion" }), {
          method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ request_id: created.id, idempotency_key: deletionKey }),
        });
        const result = await response.json().catch(() => null);
        if (!response.ok) {
          if (result?.detail?.code === "client_file_purge_pending") {
            const requestId = result.detail.request_id || created.id;
            setPendingDeletionRequestId(requestId);
            setPendingDeletionRequests((items) => [...items.filter((item) => item.id !== requestId), {
              id: requestId, cleanup_idempotency_key: deletionKey, cleanup_pending: true,
            }]);
          }
          throw new Error(errorText(result, "Client deletion failed."));
        }
        setPendingDeletionRequestId(null);
        loadPendingDeletionRequests();
        setSelected(null); setStatus("Client data deletion completed and recorded."); loadSearch(0);
      }
      setPrivacyVerification("");
    } catch (err) { setError(err.message || "Privacy request failed."); }
    finally { setBusy(false); }
  };

  const retryPrivacyDeletion = async (retryRequest = null) => {
    const requestId = retryRequest?.id || pendingDeletionRequestId;
    const retryKey = retryRequest?.cleanup_idempotency_key || pendingDeletionRequests.find((item) => item.id === requestId)?.cleanup_idempotency_key;
    if (!requestId || !retryKey) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(url({ resource: "privacy", privacy_action: "deletion" }), {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: requestId, idempotency_key: retryKey }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorText(payload, "Client deletion retry failed."));
      setPendingDeletionRequestId(null);
      setPendingDeletionRequests((items) => items.filter((item) => item.id !== requestId));
      setSelected(null); setStatus("Client data deletion completed and recorded."); loadSearch(0);
      loadPendingDeletionRequests();
    } catch (err) { setError(err.message || "Client deletion retry failed."); }
    finally { setBusy(false); }
  };

  const releasePrivacyHold = async (holdId) => {
    const reason = window.prompt("Record why this retention hold is being released:");
    if (!reason?.trim()) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(url({ resource: "privacy", privacy_action: "hold_release", hold_id: holdId }), {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorText(payload, "Retention hold could not be released."));
      setPrivacyHolds((items) => items.map((hold) => hold.id === holdId ? { ...hold, released_at: new Date().toISOString() } : hold));
      setStatus("Hold release recorded with the actor and reason. A new deletion request can now proceed.");
    } catch (err) { setError(err.message || "Retention hold could not be released."); }
    finally { setBusy(false); }
  };

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    loadSearch(0);
  };

  // TASK-011: typed field values are built from the definition the form selects, so the
  // payload carries the one value column the server validates against.
  const applyFieldValue = async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
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
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const saved = await send({ client_id: selected.id, resource: "visit-notes" }, "POST",
      { class: form.get("vn_class"), visibility: form.get("vn_visibility"), body: form.get("vn_body") },
      "Visit note added.");
    if (saved) { formElement.reset(); loadVisitNotes(0); }
  };

  const addPreference = async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
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
    if (saved) { formElement.reset(); loadPreferences(0); }
  };

  const createFieldDefinition = async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
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
    if (saved) { formElement.reset(); loadFieldDefs(0); }
  };

  // TASK-012 import. The preview is a dry run: nothing is created until commit.
  const previewImport = async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const file = form.get("import_file");
    if (!file || typeof file === "string") { setError("Choose a CSV file to preview."); return; }
    const mapping = {};
    for (const [target, column] of [["name", "name"], ["email", "email"], ["phone", "phone"],
                                    ["preferred_name", "preferred_name"], ["lifecycle", "lifecycle"],
                                    ["locale", "locale"], ["consent_proof", "consent_proof"]]) {
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
    const key = `salon-import-${importId}`;
    const saved = await send({ resource: "imports", import_id: importId, import_action: "commit" },
      "POST", { expected_version: version, idempotency_key: key }, "Import committed.");
    if (saved) {
      setImportPreview((current) => current?.id === importId ? { ...current, status: "committed" } : current);
      loadImports(); loadImportRows(importId); loadSearch(0);
    }
  };

  const correctImportRow = async (event, row) => {
    event.preventDefault();
    if (!importPreview?.id) return;
    const form = new FormData(event.currentTarget);
    const values = Object.fromEntries(["name", "preferred_name", "email", "phone", "lifecycle", "locale"]
      .map((key) => [key, String(form.get(key) || "").trim()]));
    setBusy(true); setError(""); setStatus("");
    try {
      const response = await fetch(url({ resource: "imports", import_id: importPreview.id,
        import_action: "correct", row_number: row.row_number }), {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expected_version: importPreview.version, values }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorText(payload, "The staged row could not be corrected."));
      setImportPreview((current) => current?.id === importPreview.id ? {
        ...current, version: payload.version, valid_rows: payload.valid_rows,
        error_rows: payload.error_rows, duplicate_rows: payload.duplicate_rows,
        total_rows: payload.total_rows,
      } : current);
      setStatus(`Row ${row.row_number} updated: ${payload.status}.`);
      loadImportRows(importPreview.id, "", importRowsOffset);
      loadImports();
    } catch (err) {
      setError(err.message || "The staged row could not be corrected.");
    } finally { setBusy(false); }
  };

  const recordConsent = async (importId, rowNumber) => {
    const proof = window.prompt("Consent proof reference (e.g. signed form, date):");
    if (!proof) return;
    const saved = await send({ resource: "imports", import_id: importId, import_action: "consent", row_number: rowNumber },
      "PATCH", { consent_proof: proof, marketing_eligible: true }, "Consent recorded.");
    if (saved) loadImportRows(importId);
  };

  const resumeImport = (item) => {
    setImportPreview(item);
    loadImportRows(item.id);
  };

  const previewMerge = async (merged) => {
    if (!selected?.id || !merged?.id || selected.id === merged.id) return;
    setBusy(true); setError(""); setStatus(""); setMergeAcknowledged(false);
    try {
      const response = await fetch(url({ resource: "merges", merge_action: "preview" }), {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ survivor_client_id: selected.id, merged_client_id: merged.id }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorText(payload, "Merge preview failed."));
      setMergePreview({ ...payload, idempotency_key: `salon-merge-${merged.id}-${Date.now()}` });
    } catch (err) { setError(err.message || "Merge preview failed."); }
    finally { setBusy(false); }
  };

  const commitMerge = async () => {
    if (!mergePreview || !mergeAcknowledged) return;
    setBusy(true); setError(""); setStatus("");
    try {
      const response = await fetch(url({ resource: "merges", merge_action: "commit" }), {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          survivor_client_id: mergePreview.survivor.id, merged_client_id: mergePreview.merged.id,
          expected_survivor_version: mergePreview.survivor.version,
          expected_merged_version: mergePreview.merged.version,
          acknowledged_conflicts: true, idempotency_key: mergePreview.idempotency_key,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorText(payload, "Client merge failed."));
      setMergePreview(null); setMergeAcknowledged(false);
      setStatus("Merge recorded. Linked history now appears on the surviving client; consent remains unchanged.");
      await load(selected.id); loadSearch(0);
    } catch (err) { setError(err.message || "Client merge failed."); }
    finally { setBusy(false); }
  };

  useEffect(() => { if (tenantId) loadImports(); }, [tenantId, loadImports]);

  const formatDate = (iso) => new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
  const timelineDetails = (entry) => {
    const details = entry.details || {};
    if (entry.action === "appointment.status_changed") return `${details.from_status || "created"} → ${details.to_status || "updated"}`;
    if (entry.action === "visit.completed") return `Completed services: ${(details.services || []).join(", ") || "recorded"}`;
    if (entry.action === "visit_note.created") return `${details.class || "general"} note: ${details.body || ""}`;
    if (entry.action === "receipt.recorded") {
      const amount = Number(details.amount_minor || 0) / 100;
      return `${details.kind || "receipt"}: ${new Intl.NumberFormat(undefined, { style: "currency", currency: details.currency || "CAD" }).format(amount)} (${details.method || "other"})`;
    }
    if (entry.action.startsWith("communication.")) return [details.channel, details.purpose, details.state].filter(Boolean).join(" · ");
    return entry.reason || "";
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f5f3ef", color: "#20231f", fontFamily: "Inter, system-ui, sans-serif" }}>
      <Head><title>Clients · Salon Operations</title></Head>
      <main style={{ padding: "38px 5vw", maxWidth: 1040, margin: "0 auto" }}>
        <header style={{ marginBottom: 24 }}>
          <div style={muted}>Client records</div>
          <h1 style={{ margin: "6px 0", fontSize: 30 }}>Clients</h1>
          <p style={muted}>Reusable profiles with their own contact details, kept separate from each other and from any other salon.</p>
        </header>

        {pendingDeletionRequests.length > 0 && <section role="status" style={{ ...panel, borderColor: "#d5b87b" }}>
          <h2 style={{ fontSize: 16, margin: "0 0 8px" }}>Attachment cleanup needs a retry</h2>
          <p style={muted}>These verified deletions are recorded. Retry removes the remaining private files; the request stays available if you reload this page.</p>
          {pendingDeletionRequests.map((item) => <button key={item.id} type="button" style={ghostButton}
            disabled={busy || !item.cleanup_idempotency_key} onClick={() => retryPrivacyDeletion(item)}>
            Retry cleanup for request {item.id}
          </button>)}
        </section>}

        

        {error && <p role="alert" style={{ ...panel, color: "#8c2626" }}>{error}</p>}
        {status && <p role="status" aria-live="polite" style={{ ...panel, color: "#2c3f31" }}>{status}</p>}
        {notice && <p style={{ ...panel, color: "#8a5a1f" }}>{notice}</p>}

        {!tenantId ? (
          <p style={muted}>Select a salon from your account to continue.</p>
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
                          {selected?.id && c.id !== selected.id && (
                            <button type="button" style={ghostButton} onClick={() => previewMerge(c)} disabled={busy}>
                              Review merge into selected
                            </button>
                          )}
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
                <label style={{ maxWidth: 320 }}>Preferred location
                  <select style={select} name="preferred_location_id" required value={clientLocation} onChange={(event) => setClientLocation(event.target.value)}>
                    <option value="">Choose a location</option>
                    {locations.map((location) => <option key={location.id} value={location.id}>{location.display_name}</option>)}
                  </select>
                </label>
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
                <label style={{ maxWidth: 140 }}>lifecycle column
                  <input style={input} name="map_lifecycle" defaultValue="lifecycle" maxLength={80} placeholder="optional" />
                </label>
                <label style={{ maxWidth: 140 }}>locale column
                  <input style={input} name="map_locale" defaultValue="locale" maxLength={80} placeholder="optional" />
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
                    <button type="button" style={button} disabled={busy || importPreview.valid_rows === 0 || importPreview.error_rows > 0}
                      onClick={() => commitImport(importPreview.id, importPreview.version)}>
                      {importPreview.error_rows > 0 ? "Resolve all row errors to commit" : `Commit ${importPreview.valid_rows} row(s)`}
                    </button>
                    <button type="button" style={ghostButton} disabled={busy} onClick={() => loadImportRows(importPreview.id, "error")}>Show errors</button>
                    <button type="button" style={ghostButton} disabled={busy} onClick={() => loadImportRows(importPreview.id)}>Show all rows</button>
                  </div>
                  <p style={{ ...muted, marginTop: 0 }}>Showing {importRowsOffset + 1}–{Math.min(importRowsOffset + importRows.length, importRowsTotal)} of {importRowsTotal} staged row(s).</p>
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
                        {row.normalized?.lifecycle && <span style={muted}>Lifecycle: {row.normalized.lifecycle} </span>}
                        {row.normalized?.locale && <span style={muted}>Locale: {row.normalized.locale}</span>}
                        {row.status !== "committed" && importPreview.status !== "committed" && (
                          <form key={`${row.row_number}-${importPreview.version}`} onSubmit={(event) => correctImportRow(event, row)}
                            style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8, alignItems: "flex-end" }}>
                            <label style={{ maxWidth: 200 }}>Name
                              <input style={input} name="name" required maxLength={120} defaultValue={row.normalized?.name || ""} />
                            </label>
                            <label style={{ maxWidth: 220 }}>Preferred name
                              <input style={input} name="preferred_name" maxLength={120} defaultValue={row.normalized?.preferred_name || ""} />
                            </label>
                            <label style={{ maxWidth: 220 }}>Email
                              <input style={input} name="email" type="email" maxLength={254} defaultValue={row.normalized?.email || ""} />
                            </label>
                            <label style={{ maxWidth: 170 }}>Phone
                              <input style={input} name="phone" type="tel" maxLength={40} defaultValue={row.normalized?.phone || ""} />
                            </label>
                            <label style={{ maxWidth: 140 }}>Lifecycle
                              <select style={select} name="lifecycle" defaultValue={row.normalized?.lifecycle || "lead"}>
                                <option value="lead">Lead</option><option value="active">Active</option>
                                <option value="lapsed">Lapsed</option><option value="archived">Archived</option>
                              </select>
                            </label>
                            <label style={{ maxWidth: 140 }}>Locale
                              <select style={select} name="locale" defaultValue={row.normalized?.locale || "en-CA"}>
                                <option value="en-CA">English (Canada)</option><option value="fr-CA">French (Canada)</option>
                              </select>
                            </label>
                            <button type="submit" style={ghostButton} disabled={busy}>Update staged row</button>
                          </form>
                        )}
                      </li>
                    ))}
                  </ul>
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button type="button" style={ghostButton} disabled={busy || importRowsOffset === 0}
                      onClick={() => loadImportRows(importPreview.id, "", Math.max(0, importRowsOffset - 50))}>Previous rows</button>
                    <button type="button" style={ghostButton} disabled={busy || importRowsOffset + importRows.length >= importRowsTotal}
                      onClick={() => loadImportRows(importPreview.id, "", importRowsOffset + 50)}>Next rows</button>
                  </div>
                </div>
              )}

              {imports.length > 0 && (
                <details style={{ marginTop: 14 }}>
                  <summary style={muted}>Previous imports ({importsTotal})</summary>
                  <ul style={{ listStyle: "none", padding: 0 }}>
                    {imports.map((item) => (
                      <li key={item.id} style={{ borderBottom: "1px solid #efece5", padding: "10px 0" }}>
                        <span style={{ fontWeight: 600 }}>{item.filename}</span>
                        <button type="button" style={{ ...ghostButton, marginLeft: 8 }} disabled={busy}
                          onClick={() => resumeImport(item)}>Review / resume</button>
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
                <details style={{ margin: "10px 0 16px" }}>
                  <summary style={{ cursor: "pointer", fontWeight: 600 }}>Client data rights</summary>
                  <p style={muted}>Record the verification method before exporting or deleting. Deletion is blocked by any active retention hold.</p>
                  <form onSubmit={submitPrivacyRequest} style={{ display: "grid", gap: 10, maxWidth: 520 }}>
                    <label>Request
                      <select style={input} value={privacyType} onChange={(event) => setPrivacyType(event.target.value)}>
                        <option value="export">Export client data</option>
                        <option value="deletion">Delete client data</option>
                      </select>
                    </label>
                    <label>Verification method
                      <input style={input} required minLength={3} maxLength={240} value={privacyVerification}
                        onChange={(event) => setPrivacyVerification(event.target.value)} placeholder="For example, signed request checked in person" />
                    </label>
                    <button type="submit" style={button} disabled={busy}>{busy ? "Processing…" : "Record and continue"}</button>
                  </form>
                </details>
                {privacyHolds.length > 0 && <section aria-label="Client retention holds" style={{ ...panel, padding: 14 }}>
                  <h3 style={{ fontSize: 15, margin: "0 0 8px" }}>Retention holds</h3>
                  {privacyHolds.map((hold) => <div key={hold.id} style={{ marginBottom: 10 }}>
                    <p style={{ ...muted, margin: "0 0 5px" }}>{hold.basis} · {hold.released_at ? "released" : "active"}</p>
                    {!hold.released_at && <button type="button" style={ghostButton} disabled={busy}
                      onClick={() => releasePrivacyHold(hold.id)}>Record hold release</button>}
                  </div>)}
                </section>}
                {mergePreview && mergePreview.survivor.id === selected.id && (
                  <section aria-label="Merge review" style={{ ...panel, marginTop: 12 }}>
                    <h3 style={{ fontSize: 15, marginTop: 0 }}>Review client merge</h3>
                    <p style={muted}>Keep <strong>{mergePreview.survivor.name}</strong>; retire <strong>{mergePreview.merged.name}</strong>.</p>
                    <p style={muted}>History rows to move: {Object.values(mergePreview.manifest || {}).reduce((sum, ids) => sum + (Array.isArray(ids) ? ids.length : 0), 0)}.</p>
                    {mergePreview.conflicts?.length > 0 ? (
                      <ul>{mergePreview.conflicts.map((conflict, index) => <li key={`${conflict.kind}-${index}`} style={muted}>
                        {conflict.kind} overlap: {conflict.resolution}
                      </li>)}</ul>
                    ) : <p style={muted}>No shared contact conflicts found.</p>}
                    <p style={{ ...muted, fontWeight: 600 }}>Consent and opt-out records stay bound to their original contact. A merge never grants marketing eligibility.</p>
                    <label style={{ display: "flex", gap: 8, alignItems: "flex-start", ...muted }}>
                      <input type="checkbox" checked={mergeAcknowledged} onChange={(event) => setMergeAcknowledged(event.target.checked)} />
                      I reviewed this preview and confirm retiring the duplicate profile.
                    </label>
                    <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                      <button type="button" style={button} onClick={commitMerge} disabled={busy || !mergeAcknowledged}>Confirm merge</button>
                      <button type="button" style={ghostButton} onClick={() => { setMergePreview(null); setMergeAcknowledged(false); }} disabled={busy}>Cancel</button>
                    </div>
                  </section>
                )}

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
                            {timelineDetails(entry)}
                            {entry.changed_fields && entry.changed_fields.length > 0 && (
                              <span style={{ marginLeft: 8 }}>Fields: {entry.changed_fields.join(", ")}</span>
                            )}
                            {entry.actor?.subject && <span style={{ marginLeft: 8 }}>Actor: {entry.actor.subject}</span>}
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
                  Colour formulas, stylist preferences, product choices, rebooking, and descriptive contact channels.
                  Contact preferences do not grant marketing consent.
                </p>
                <form onSubmit={addPreference} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginTop: 14 }}>
                  <label style={{ maxWidth: 200 }}>Type
                    <select style={select} name="pref_type" defaultValue="colour_formula">
                      <option value="colour_formula">Colour Formula</option>
                      <option value="stylist_preference">Stylist Preference</option>
                      <option value="product">Product</option>
                      <option value="rebooking_interval">Rebooking Interval</option>
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
export const getServerSideProps=privatePage("staff");
