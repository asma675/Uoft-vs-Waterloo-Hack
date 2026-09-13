# TrustMesh Setup & Deployment

## Local setup

```powershell
cd <your TrustMesh folder>
pnpm install
Copy-Item .env.example .env.local
notepad .env.local
pnpm dev
```

Open `http://localhost:3000` and verify `http://localhost:3000/api/health`.

A fully configured response reports Steel, AI research, and VirusTotal as `configured`. Missing optional services report `optional`; missing Steel reports `demo`.

## Recommended hackathon environment

```env
STEEL_API_KEY=your_steel_key
OPENAI_API_KEY=your_openai_key
OPENAI_MODEL=gpt-5.6-luna
VIRUSTOTAL_API_KEY=your_virustotal_key
STEEL_SESSION_TIMEOUT_MS=600000
STEEL_INACTIVITY_TIMEOUT_MS=180000
```

Restart `pnpm dev` after editing `.env.local`.

## Live mission behavior

1. Mission prompt is submitted to `/api/missions`.
2. Steel provisions three isolated research sessions.
3. Explicit URLs are used directly; otherwise the AI research planner returns exact canonical source URLs.
4. Steel inspects the selected pages.
5. SignalShield scores content-integrity risks and can quarantine sources.
6. Evidence is synthesized only from known source IDs and every source URL remains clickable in the UI.
7. The explainable Trust Score is calculated.
8. The Executor remains locked until the user explicitly approves.
9. On approval, `/api/approve` may provision a separate Executor session.

## VirusTotal

SignalShield includes an optional VirusTotal URL scanner. Configure `VIRUSTOTAL_API_KEY`; the key never enters client-side code. The scanner submits a URL server-side and exposes a link to the full VirusTotal report.

## Production check

```powershell
pnpm build
pnpm start
```

For a public deployment, add authentication, durable mission storage, rate limiting, a secret manager, observability, and scoped Executor adapters. Those are not required for the hackathon demo.
