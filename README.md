# Salon frontend (Next.js)

Staff and public web surfaces for Salon Operations Cloud. Stateless proxy
pages under `pages/api/` forward the browser's cookies to the backend, which
resolves the caller from its own session and enforces tenant scope. The proxy
never decides identity and never trusts a tenant id from the client.

Origin: extracted from the `salon` workspace monorepo at `cabbad2`
(`apps/web` → repo root). Workspace plan state stays in the parent
`salon/.loop-engineer` directory.

## Develop

```bash
npm install
set "API_BASE_URL=http://127.0.0.1:8000"
npm run dev
```

Production build check: `npm run build`.

## Contract

- Backend base URL comes from `API_BASE_URL` (server) /
  `NEXT_PUBLIC_API_BASE_URL` (browser). See `.env.example`.
- Route query params that name resources (`tenant_id`, `client_id`, …) are
  never replayed upstream; the backend session owns scope.
