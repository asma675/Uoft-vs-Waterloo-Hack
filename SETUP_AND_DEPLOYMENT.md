# TrustMesh Setup & Deployment

## 1. Required software

- Node.js `>=22.13.0`
- pnpm `11.25.0`

```bash
corepack enable
pnpm install
```

## 2. Environment variables

Copy `.env.example` to `.env`.

### `STEEL_API_KEY`

Recommended for the hackathon demo. Enables real isolated Steel cloud sessions, driven directly over the Chrome DevTools Protocol (no Playwright — this app deploys to Cloudflare Workers, where Playwright's driver assumptions don't hold).

Without it, TrustMesh automatically remains usable in complete demo mode.

### `ANTHROPIC_API_KEY` (required for live mode)

Powers the Scout and Verifier agents' browsing loop (navigate/read/click via Claude tool-calling) and the Adversary's manipulation classifier. Live Steel missions require both this and `STEEL_API_KEY` — missing either falls back to demo mode with a notice.

### `TRUSTMESH_MODEL` (optional)

Defaults to `claude-sonnet-5` — a deliberately budget-conscious default. Bump to a stronger model via this env var if quality matters more than cost for your run.

### `TRUSTMESH_MAX_TURNS_PER_AGENT` (optional)

Defaults to `8`. Caps worst-case token spend per agent per mission — an agent that can't find a confident answer within this many turns returns its best partial finding instead of running unbounded.

### `STEEL_SESSION_TIMEOUT_MS` / `STEEL_INACTIVITY_TIMEOUT_MS`

Defaults: 10-minute hard timeout and 3-minute inactivity timeout. TrustMesh also exposes explicit session release from the UI.

## 3. Local run

```bash
pnpm dev
```

For an optimized build:

```bash
pnpm build
pnpm start
```

## 4. Judge-safe demo sequence

For maximum reliability, start in demo mode. It demonstrates the full workflow with no outside dependency. Then toggle **LIVE STEEL** to show real browser sessions if credentials/network are available.

For live research, configure both `STEEL_API_KEY` and `ANTHROPIC_API_KEY` — the agents will browse to a URL named directly in the mission text if one is given, or search for one themselves if not.

## 5. What is already functional

- Responsive dark/light UI
- Blue Steel-inspired visual language with animated browser-swarm status, scanning, glowing topology, and score motion
- Real Steel research session provisioning
- Embedded/openable Steel `debugUrl` live views
- Explicit Steel session release
- Claude-powered autonomous browsing agents (Scout/Verifier navigate, read, and click via tool-calling over raw CDP)
- SignalShield heuristics
- Source quarantine
- Cross-source evidence comparison
- Explainable Trust Score
- Human approve/reject
- Post-approval Executor provisioning
- Audit export
- Credential-free demo fallback

## 6. What you should add before a real public launch

These are deployment/organization concerns rather than missing hackathon UI features:

1. **Authentication and tenant isolation** — Auth0, Clerk, Supabase Auth, or your existing identity provider.
2. **Durable database** — Postgres/Supabase/Neon for missions, evidence, approvals, and immutable audit records. The current hackathon build keeps mission state client-side after each API response.
3. **Distributed rate limiting** — Cloudflare KV/Durable Objects, Redis/Upstash, or your platform equivalent. Protect `/api/missions` because live browser + model calls have cost.
4. **Secret manager** — store API keys in Vercel/Cloudflare/hosting secrets, never in source control or browser code.
5. **Observability** — Sentry/OpenTelemetry plus request IDs and cost/latency dashboards.
6. **Execution adapters** — build explicit, allow-listed adapters for each action class (checkout, booking, form submission, account changes). Do not make a generic arbitrary-web-action Executor for production.
7. **Approval persistence** — bind approval to an authenticated user, mission revision, staged action hash, and expiry before executing a consequential action.
8. **Domain policy engine** — per-action limits, prohibited actions, credential rules, spend caps, and rollback/reversal behavior.
9. **Evaluation suite** — curated prompt-injection, dark-pattern, affiliate-bias, deceptive-price, hidden-text, and redirect test pages with expected quarantine outcomes.
10. **Legal/privacy review** — define retention for browsing traces, screenshots, credentials, and user-supplied data.

## 7. Recommended deployment shape

```text
Browser client
  │
  ▼
Next/Cloudflare/Vercel web app
  ├── TrustMesh API routes
  ├── Auth + rate limit
  ├── Mission/audit database
  ├── Claude tool-calling agents (Scout/Verifier/Adversary classifier)
  └── Steel Sessions, driven over raw CDP
```

Keep `STEEL_API_KEY` and `ANTHROPIC_API_KEY` server-side only.
