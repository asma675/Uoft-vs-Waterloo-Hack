# TrustMesh — SteelBlue Presentation Build

TrustMesh is a zero-trust verification and safety layer for autonomous browser agents. It separates discovery, independent verification, adversarial review, human approval, and execution so that no single webpage or research agent can authorize a consequential action.

## Presentation pages

The UI intentionally contains only four top-level pages:

- **Mission** — launch the Scout / Verifier / Adversary swarm and review the staged action.
- **Sessions** — inspect isolated Steel browser sessions and release them explicitly.
- **Evidence** — see claim provenance, trust factors, and clickable source URLs.
- **SignalShield** — inspect manipulation signals, source quarantine, and optional VirusTotal threat intelligence.

The previous **Audit** and **Config** pages were removed from the navigation for a tighter judge demo. Mission events are still retained internally for safe execution logic.

## Source layout

```text
TrustMesh/
├── app/                 # Next.js entrypoints + thin API route adapters
│   └── api/
├── frontend/            # UI, components, styles, frontend hooks
│   ├── components/
│   ├── hooks/
│   └── styles/
├── backend/             # Steel, AI research, SignalShield, VirusTotal, orchestration
├── shared/              # Shared mission types, trust scoring, demo state
├── public/
└── package.json
```

This keeps the project easy to explain while preserving a single-process Next.js development workflow.

## Run locally

Requires Node.js 22.13+ and pnpm 11.25.0.

```powershell
pnpm install
pnpm dev
```

Then open `http://localhost:3000`.

For a production check:

```powershell
pnpm build
pnpm start
```

## Environment variables

Copy `.env.example` to `.env.local` and add only the services you want to enable:

```env
STEEL_API_KEY=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.6-luna
VIRUSTOTAL_API_KEY=
STEEL_SESSION_TIMEOUT_MS=600000
STEEL_INACTIVITY_TIMEOUT_MS=180000
```

- `STEEL_API_KEY`: real isolated Steel browser sessions.
- `OPENAI_API_KEY`: autonomous web-source discovery and evidence synthesis. If omitted, live missions can still verify explicit URLs supplied in the mission prompt.
- `VIRUSTOTAL_API_KEY`: optional URL reputation scan inside SignalShield.

Never commit `.env.local`; `.gitignore` keeps secret env files out of Git while allowing `.env.example` to be committed.

## Source links

Live research now preserves and displays the exact URL for every discovered source. Source links appear in the staged Mission result, the Evidence provenance table, the source directory, and the SignalShield source table. AI-generated evidence is validated against known source IDs so invented citations are not treated as confirmed evidence.

## Hydration fix

The initial demo mission uses a fixed SSR seed (`TM-DEMO01`, fixed approval token, fixed timestamp). Random mission IDs and current timestamps are generated only after client-side user actions or server API calls. This removes the server/client mission-ID mismatch that previously caused React hydration errors.

## Demo-safe behavior

Without API keys the complete deterministic TrustMesh demo still works. With Steel configured, live isolated sessions are provisioned. The Executor remains unprovisioned until explicit human approval.
