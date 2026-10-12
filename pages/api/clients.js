import { randomUUID } from "crypto";

// Stateless proxy, same contract as api/settings.js and api/team.js: forward the browser's
// cookies so the API resolves the caller from its own session and enforces tenant scope.
// The proxy never decides who the caller is and never trusts a tenant id from the client.
const API_BASE = process.env.API_BASE_URL;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function buildTarget(path, query) {
  const url = new URL(path, API_BASE);
  for (const [key, raw] of Object.entries(query || {})) {
    // Routing parameters are never replayed upstream as query values.
    if (["tenant_id", "client_id", "resource", "contact_id", "field_definition_id", "field_value_id", "note_id", "preference_id", "import_id", "import_action", "row_number", "privacy_action", "catalogue_action", "service_id"].includes(key)) continue;
    for (const value of Array.isArray(raw) ? raw : [raw]) {
      url.searchParams.append(key, String(value));
    }
  }
  return url;
}

export default async function handler(req, res) {
  const requestId = randomUUID();
  res.setHeader("X-Request-ID", requestId);

  if (!API_BASE) {
    return res.status(503).json({ detail: { code: "clients_service_unconfigured" } });
  }

  const tenantId = req.query.tenant_id;
  if (!tenantId || Array.isArray(tenantId) || !UUID.test(String(tenantId))) {
    return res.status(400).json({ detail: { code: "invalid_tenant_id" } });
  }
  const clientId = req.query.client_id ? String(req.query.client_id) : null;
  if (clientId && !UUID.test(clientId)) {
    return res.status(400).json({ detail: { code: "invalid_client_id" } });
  }
  const resource = req.query.resource ? String(req.query.resource) : null;
  const allowedResources = ["contacts", "timeline", "search", "field-definitions", "field-values", "visit-notes", "preferences", "imports", "privacy", "catalogue"];
  if (resource && !allowedResources.includes(resource)) {
    return res.status(404).json({ detail: { code: "not_found" } });
  }
  const contactId = req.query.contact_id ? String(req.query.contact_id) : null;
  if (contactId && !UUID.test(contactId)) {
    return res.status(400).json({ detail: { code: "invalid_contact_id" } });
  }
  const fieldDefinitionId = req.query.field_definition_id ? String(req.query.field_definition_id) : null;
  if (fieldDefinitionId && !UUID.test(fieldDefinitionId)) {
    return res.status(400).json({ detail: { code: "invalid_field_definition_id" } });
  }
  const fieldValueId = req.query.field_value_id ? String(req.query.field_value_id) : null;
  if (fieldValueId && !UUID.test(fieldValueId)) {
    return res.status(400).json({ detail: { code: "invalid_field_value_id" } });
  }
  const noteId = req.query.note_id ? String(req.query.note_id) : null;
  if (noteId && !UUID.test(noteId)) {
    return res.status(400).json({ detail: { code: "invalid_note_id" } });
  }
  const preferenceId = req.query.preference_id ? String(req.query.preference_id) : null;
  if (preferenceId && !UUID.test(preferenceId)) {
    return res.status(400).json({ detail: { code: "invalid_preference_id" } });
  }
  const importId = req.query.import_id ? String(req.query.import_id) : null;
  if (importId && !UUID.test(importId)) {
    return res.status(400).json({ detail: { code: "invalid_import_id" } });
  }
  const importAction = req.query.import_action ? String(req.query.import_action) : null;

  // Only the shapes with an API route are forwarded; anything else is refused here
  // rather than producing a routing error from the API.
  const method = req.method;
  let upstreamPath;
  let allow;

  // Imports are a tenant-level resource, not a per-client one: the CSV maps many clients
  // at once. `import_action` selects the sub-route so the browser still speaks one proxy.
  if (resource === "imports") {
    if (clientId) {
      return res.status(404).json({ detail: { code: "not_found" } });
    }
    if (!importId) {
      if (importAction === "preview") {
        if (method !== "POST") {
          res.setHeader("Allow", "POST");
          return res.status(405).json({ detail: { code: "method_not_allowed" } });
        }
        upstreamPath = `/v1/tenants/${tenantId}/imports/preview`;
        allow = "POST";
      } else if (method === "GET") {
        upstreamPath = `/v1/tenants/${tenantId}/imports`;
        allow = "GET";
      } else {
        return res.status(404).json({ detail: { code: "not_found" } });
      }
    } else if (importAction === "commit") {
      if (method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ detail: { code: "method_not_allowed" } });
      }
      upstreamPath = `/v1/tenants/${tenantId}/imports/${importId}/commit`;
      allow = "POST";
    } else if (importAction === "rows") {
      if (method !== "GET") {
        res.setHeader("Allow", "GET");
        return res.status(405).json({ detail: { code: "method_not_allowed" } });
      }
      upstreamPath = `/v1/tenants/${tenantId}/imports/${importId}/rows`;
      allow = "GET";
    } else if (importAction === "consent") {
      if (method !== "PATCH") {
        res.setHeader("Allow", "PATCH");
        return res.status(405).json({ detail: { code: "method_not_allowed" } });
      }
      const rowNumber = Number(req.query.row_number);
      if (!Number.isInteger(rowNumber) || rowNumber < 1) {
        return res.status(400).json({ detail: { code: "invalid_row_number" } });
      }
      upstreamPath = `/v1/tenants/${tenantId}/imports/${importId}/rows/${rowNumber}/consent`;
      allow = "PATCH";
    } else {
      return res.status(404).json({ detail: { code: "not_found" } });
    }
  } else if (resource === "catalogue") {
    // Service catalogue is tenant-level and selected by `catalogue_action`.
    if (clientId) {
      return res.status(404).json({ detail: { code: "not_found" } });
    }
    const action = req.query.catalogue_action ? String(req.query.catalogue_action) : null;
    let target = null;
    let expected = null;
    if (action === "services" && method === "GET") {
      target = `/v1/tenants/${tenantId}/services`; expected = "GET";
    } else if (action === "services" && method === "POST") {
      target = `/v1/tenants/${tenantId}/services`; expected = "POST";
    } else if (action === "categories" && method === "GET") {
      target = `/v1/tenants/${tenantId}/service-categories`; expected = "GET";
    } else if (action === "categories" && method === "POST") {
      target = `/v1/tenants/${tenantId}/service-categories`; expected = "POST";
    } else if (action === "service" && method === "PATCH") {
      const serviceId = req.query.service_id ? String(req.query.service_id) : null;
      if (!serviceId || !UUID.test(serviceId)) {
        return res.status(400).json({ detail: { code: "invalid_service_id" } });
      }
      target = `/v1/tenants/${tenantId}/services/${serviceId}`; expected = "PATCH";
    } else if ((action === "archive" || action === "restore") && method === "POST") {
      const serviceId = req.query.service_id ? String(req.query.service_id) : null;
      if (!serviceId || !UUID.test(serviceId)) {
        return res.status(400).json({ detail: { code: "invalid_service_id" } });
      }
      target = `/v1/tenants/${tenantId}/services/${serviceId}/${action}`; expected = "POST";
    }
    if (!target) {
      return res.status(404).json({ detail: { code: "not_found" } });
    }
    upstreamPath = target;
    allow = expected;
  } else if (resource === "privacy") {
    // Privacy requests are tenant-level and selected by `privacy_action`.
    if (clientId) {
      return res.status(404).json({ detail: { code: "not_found" } });
    }
    const action = req.query.privacy_action ? String(req.query.privacy_action) : null;
    const routes = {
      "requests": ["GET", `/v1/tenants/${tenantId}/privacy-requests`, "GET"],
      "create": ["POST", `/v1/tenants/${tenantId}/privacy-requests`, "POST"],
      "export": ["POST", `/v1/tenants/${tenantId}/privacy-requests/export`, "POST"],
      "correction": ["POST", `/v1/tenants/${tenantId}/privacy-requests/correction`, "POST"],
      "deletion": ["POST", `/v1/tenants/${tenantId}/privacy-requests/deletion`, "POST"],
      "hold": ["POST", `/v1/tenants/${tenantId}/retention-holds`, "POST"],
    };
    const chosen = routes[action];
    if (!chosen) {
      return res.status(404).json({ detail: { code: "not_found" } });
    }
    if (method !== chosen[0]) {
      res.setHeader("Allow", chosen[2]);
      return res.status(405).json({ detail: { code: "method_not_allowed" } });
    }
    upstreamPath = chosen[1];
    allow = chosen[2];
  } else if (!clientId) {
    if (contactId || resource === "timeline") {
      return res.status(404).json({ detail: { code: "not_found" } });
    }
    if (resource === "search") {
      if (method !== "GET") {
        res.setHeader("Allow", "GET");
        return res.status(405).json({ detail: { code: "method_not_allowed" } });
      }
      upstreamPath = `/v1/tenants/${tenantId}/clients/search`;
      allow = "GET";
    } else if (resource === "field-definitions") {
      if (method !== "GET" && method !== "POST") {
        res.setHeader("Allow", "GET, POST");
        return res.status(405).json({ detail: { code: "method_not_allowed" } });
      }
      if (fieldDefinitionId) {
        if (method !== "PATCH") {
          res.setHeader("Allow", "PATCH");
          return res.status(405).json({ detail: { code: "method_not_allowed" } });
        }
        upstreamPath = `/v1/tenants/${tenantId}/field-definitions/${fieldDefinitionId}`;
        allow = "PATCH";
      } else {
        upstreamPath = `/v1/tenants/${tenantId}/field-definitions`;
        allow = method === "GET" ? "GET" : "POST";
      }
    } else {
      // Collection: only POST for create
      if (method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ detail: { code: "method_not_allowed" } });
      }
      upstreamPath = `/v1/tenants/${tenantId}/clients`;
      allow = "POST";
    }
  } else if (resource === "field-definitions") {
    if (!fieldDefinitionId) {
      return res.status(404).json({ detail: { code: "not_found" } });
    }
    if (method !== "PATCH") {
      res.setHeader("Allow", "PATCH");
      return res.status(405).json({ detail: { code: "method_not_allowed" } });
    }
    upstreamPath = `/v1/tenants/${tenantId}/field-definitions/${fieldDefinitionId}`;
    allow = "PATCH";
  } else if (resource === "field-values") {
    if (!fieldValueId) {
      if (method !== "GET" && method !== "POST") {
        res.setHeader("Allow", "GET, POST");
        return res.status(405).json({ detail: { code: "method_not_allowed" } });
      }
      upstreamPath = `/v1/tenants/${tenantId}/clients/${clientId}/field-values`;
      allow = method === "GET" ? "GET" : "POST";
    } else {
      if (method !== "PATCH") {
        res.setHeader("Allow", "PATCH");
        return res.status(405).json({ detail: { code: "method_not_allowed" } });
      }
      upstreamPath = `/v1/tenants/${tenantId}/clients/${clientId}/field-values/${fieldValueId}`;
      allow = "PATCH";
    }
  } else if (resource === "visit-notes") {
    if (!noteId) {
      if (method !== "GET" && method !== "POST") {
        res.setHeader("Allow", "GET, POST");
        return res.status(405).json({ detail: { code: "method_not_allowed" } });
      }
      upstreamPath = `/v1/tenants/${tenantId}/clients/${clientId}/visit-notes`;
      allow = method === "GET" ? "GET" : "POST";
    } else {
      if (method !== "PATCH") {
        res.setHeader("Allow", "PATCH");
        return res.status(405).json({ detail: { code: "method_not_allowed" } });
      }
      upstreamPath = `/v1/tenants/${tenantId}/clients/${clientId}/visit-notes/${noteId}`;
      allow = "PATCH";
    }
  } else if (resource === "preferences") {
    if (!preferenceId) {
      if (method !== "GET" && method !== "POST") {
        res.setHeader("Allow", "GET, POST");
        return res.status(405).json({ detail: { code: "method_not_allowed" } });
      }
      upstreamPath = `/v1/tenants/${tenantId}/clients/${clientId}/preferences`;
      allow = method === "GET" ? "GET" : "POST";
    } else {
      if (method !== "PATCH") {
        res.setHeader("Allow", "PATCH");
        return res.status(405).json({ detail: { code: "method_not_allowed" } });
      }
      upstreamPath = `/v1/tenants/${tenantId}/clients/${clientId}/preferences/${preferenceId}`;
      allow = "PATCH";
    }
  } else if (resource === "timeline") {
    if (method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ detail: { code: "method_not_allowed" } });
    }
    upstreamPath = `/v1/tenants/${tenantId}/clients/${clientId}/timeline`;
    allow = "GET";
  } else if (resource === "contacts" && !contactId) {
    if (method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ detail: { code: "method_not_allowed" } });
    }
    upstreamPath = `/v1/tenants/${tenantId}/clients/${clientId}/contacts`;
    allow = "POST";
  } else if (resource === "contacts" && contactId) {
    if (method !== "PATCH") {
      res.setHeader("Allow", "PATCH");
      return res.status(405).json({ detail: { code: "method_not_allowed" } });
    }
    upstreamPath = `/v1/tenants/${tenantId}/clients/${clientId}/contacts/${contactId}`;
    allow = "PATCH";
  } else if (!resource && !contactId) {
    if (method !== "GET" && method !== "PATCH") {
      res.setHeader("Allow", "GET, PATCH");
      return res.status(405).json({ detail: { code: "method_not_allowed" } });
    }
    upstreamPath = `/v1/tenants/${tenantId}/clients/${clientId}`;
    allow = "GET, PATCH";
  } else {
    return res.status(404).json({ detail: { code: "not_found" } });
  }

  const cookies = req.headers.cookie || "";
  const headers = {
    "X-Request-ID": requestId,
    ...(cookies ? { cookie: cookies } : {}),
    ...(req.headers.origin ? { origin: req.headers.origin } : {}),
  };
  let body;
  const hasBody = req.body !== undefined && req.body !== null
    && !(typeof req.body === "object" && !Array.isArray(req.body) && Object.keys(req.body).length === 0);
  if (hasBody) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(req.body);
  }

  let response;
  try {
    response = await fetch(buildTarget(upstreamPath, req.query), {
      method, headers, body, redirect: "manual",
    });
  } catch {
    return res.status(503).json({ detail: { code: "clients_service_unavailable" } });
  }

  const upstreamRequestId = response.headers.get("x-request-id");
  if (upstreamRequestId) res.setHeader("X-Request-ID", upstreamRequestId);

  let parsed;
  try {
    parsed = await response.json();
  } catch {
    parsed = { detail: { code: "upstream_unreadable_response" } };
  }
  return res.status(response.status).json(parsed);
}