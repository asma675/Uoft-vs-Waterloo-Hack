# SteelBlue UI — Final presentation build

The Steel-inspired blue UI is preserved. The final navigation is intentionally reduced to Mission, Sessions, Evidence, and SignalShield so judges stay focused on the core security story.

Additions in this build:

- VirusTotal threat-intelligence panel inside SignalShield.
- Clickable source URLs throughout Mission, Evidence, and SignalShield.
- Source-ID validation so AI evidence cannot silently invent provenance.
- Deterministic initial SSR mission to eliminate hydration mismatches.
- Frontend/backend/shared source organization.
- Standard Next.js `pnpm dev` workflow rather than the Sites/Vite wrapper.
