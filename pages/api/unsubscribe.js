import { randomUUID } from "crypto";

const API_BASE = process.env.API_BASE_URL;
const TOKEN = /^[A-Za-z0-9_-]{32,128}$/;

export default async function unsubscribe(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Request-ID", randomUUID());
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ detail: { code: "method_not_allowed" } });
  }
  if (!API_BASE) return res.status(503).json({ detail: { code: "unsubscribe_service_unconfigured" } });
  const token = req.body?.token;
  if (typeof token !== "string" || !TOKEN.test(token)) {
    return res.status(400).json({ detail: { code: "invalid_unsubscribe_link" } });
  }
  let upstream;
  try {
    upstream = await fetch(new URL("/v1/public/communications/unsubscribe", API_BASE), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }), redirect: "manual", signal: AbortSignal.timeout(5000),
    });
  } catch {
    return res.status(503).json({ detail: { code: "unsubscribe_service_unavailable" } });
  }
  if (upstream.status === 204) return res.status(204).end();
  const status = upstream.status === 404 ? 404 : upstream.status >= 500 ? 503 : upstream.status;
  return res.status(status).json({ detail: { code: status === 404
    ? "unsubscribe_link_invalid_or_expired" : "unsubscribe_failed" } });
}
