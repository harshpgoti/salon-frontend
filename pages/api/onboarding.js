import { randomUUID } from "crypto";

export default async function handler(req, res) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "method_not_allowed" }); }
  const requestId = randomUUID();
  res.setHeader("X-Request-ID", requestId);
  const base = process.env.API_BASE_URL;
  if (!base) return res.status(503).json({ error: "onboarding_service_unconfigured" });
  try {
    const response = await fetch(new URL("/v1/onboarding", base), { method: "POST", headers: { "Content-Type": "application/json", "X-Request-ID": requestId, ...(req.headers.cookie ? { cookie: req.headers.cookie } : {}), ...(req.headers.origin ? { origin: req.headers.origin } : {}) }, body: JSON.stringify(req.body) });
    const body = await response.json();
    res.setHeader("X-Request-ID", response.headers.get("x-request-id") || requestId);
    return res.status(response.status).json(body);
  } catch { return res.status(503).json({ error: "onboarding_service_unavailable" }); }
}
