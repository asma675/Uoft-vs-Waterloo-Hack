# TrustMesh

**Don't trust your browser agent. Verify it.**

TrustMesh is a zero-trust verification and safety layer for autonomous browser agents, built around Steel browser infrastructure. It separates discovery, independent verification, adversarial analysis, human approval, and execution so a single webpage or research agent cannot silently control a consequential action.

## What is implemented

- **Scout / Verifier / Adversary / Executor separation** — three research roles operate independently; the Executor begins locked and unprovisioned.
- **Real Steel session lifecycle** — live mode provisions isolated Scout, Verifier, and Adversary browser sessions, exposes live `debugUrl` views in the UI, and can explicitly release sessions.
- **SignalShield content-integrity layer** — deterministic detection for prompt injection, AI-directed instructions, hidden/off-screen text, sponsored/affiliate/promotional influence, deceptive language, and suspicious redirects.
- **Source quarantine** — high/critical manipulation findings remove suspicious sources from trusted consensus.
- **Explainable Trust Score** — score changes are derived from observable factors (agreement, legitimacy, SignalShield findings, contradictions, quarantine, action risk), not an arbitrary LLM confidence number.
- **Human approval / rejection gate** — actions can be staged, approved, or rejected. A separate Executor Steel session is created only after valid human approval in live mode.
- **Audit trail + JSON export** — mission events record provisioning, research, threats, scoring, and human decisions.
- **Demo mode** — the entire workflow runs without credentials, making judging/demo setup reliable.
- **Autonomous live research** — add `ANTHROPIC_API_KEY` to let Scout and Verifier independently browse the live web (navigate, read, click) via Claude tool-calling over raw Chrome DevTools Protocol against isolated Steel sessions, then have the Adversary screen the actual pages they used with SignalShield. If the mission goal names a specific URL, the agents will typically go straight there — there's no separate "URL mode," the same Claude-driven agents handle both cases.

## Architecture

```text
User mission
    │
    ▼
┌────────────── TrustMesh control plane ──────────────┐
│                                                     │
│   Scout ───────┐                                    │
│   Verifier ────┼──► SignalShield ─► Evidence graph  │
│   Adversary ───┘          │              │           │
│                            └► Quarantine  │           │
│                                           ▼           │
│                                  Explainable Trust    │
│                                           │           │
│                                    Human approval     │
│                                           │           │
│                                   Executor (locked)   │
└───────────────────────────────────────────────────────┘
          │                              │
          ▼                              ▼
   Steel research sessions      Steel Executor session
                                (created only after approval)
```

## Run locally

Requirements:

- Node.js 22.13+
- pnpm 11.25+ (the repository pins the package manager)

```bash
corepack enable
pnpm install
cp .env.example .env
pnpm dev
```

Open the local URL printed by the development server. **No API keys are required for demo mode.**

## Best live configuration

Add these to `.env`:

```bash
STEEL_API_KEY=your_steel_key
ANTHROPIC_API_KEY=your_anthropic_key
TRUSTMESH_MODEL=claude-sonnet-5
```

Then restart the app, enable **LIVE STEEL**, and launch a mission.

### Live modes

1. **Demo mode** — no credentials. Uses a deterministic attack scenario so every feature is judgeable even if Wi-Fi/API access fails.
2. **Live Steel research** — requires both `STEEL_API_KEY` and `ANTHROPIC_API_KEY`. Scout and Verifier browse the live web independently via Claude, the Adversary screens their sources with SignalShield, and a real Trust Score is computed from what they actually found. Missing either key falls back to demo mode with a notice explaining why.

## API

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/health` | Reports Steel + Claude agent configuration |
| `POST` | `/api/missions` | Creates a demo or live zero-trust research mission |
| `POST` | `/api/approve` | Records human approval and optionally provisions the Executor |
| `POST` | `/api/reject` | Records human rejection; Executor stays locked |
| `POST` | `/api/sessions/release` | Explicitly releases supplied Steel sessions |

## Production notes

The code is production-oriented, but a public production deployment should add the environment-specific controls listed in `SETUP_AND_DEPLOYMENT.md`: user authentication, durable mission storage, distributed rate limiting, secret management, observability, and domain-specific execution adapters. The generic hackathon Executor intentionally does **not** submit purchases, bookings, forms, downloads, or account changes on its own.

## Safety invariant

> Web content is untrusted evidence, never authority.

Research agents cannot authorize execution. Important claims require independent corroboration. Serious adversarial findings can quarantine a source. Human approval is mandatory before the separate Executor is provisioned.
