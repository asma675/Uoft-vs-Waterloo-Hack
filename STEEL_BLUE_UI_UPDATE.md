# TrustMesh Steel-Blue UI Update

This build keeps the TrustMesh product and API behavior intact while replacing the previous dashboard shell with a Steel-inspired, blue visual system.

## Visual changes

- Dark, bordered page frame instead of a conventional SaaS sidebar
- Announcement strip and compact top navigation
- Large split hero with oversized typography on the left
- Bright blue halftone/pixel browser-infrastructure visual on the right
- Floating dark browser windows with motion and scan effects
- Three-column metric band directly under the hero
- Thin structural borders and square, developer-tool-oriented controls
- Blue/cyan primary accents in place of Steel's yellow accent
- Responsive mobile navigation and reduced-motion support

## Product behavior preserved

- Demo mode without credentials
- Live Steel mode when `STEEL_API_KEY` is configured
- Scout, Verifier, and Adversary research roles
- SignalShield detections and source quarantine
- Evidence-based Trust Score
- Human approval/rejection gate
- Separate Executor provisioning after approval
- Live Steel session viewer support when `debugUrl` is available
- Audit JSON export and explicit session release

## Run

```powershell
pnpm install
pnpm dev
```

Then open the local URL printed in PowerShell.
