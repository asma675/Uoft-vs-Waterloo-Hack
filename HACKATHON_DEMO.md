# TrustMesh — Judge Demo Runbook

## Core pitch

**Don't trust your browser agent. Verify it.**

TrustMesh is a zero-trust safety layer for autonomous web agents. Instead of one agent browsing and acting, three isolated research roles disagree on purpose: Scout discovers, Verifier independently checks, and Adversary tries to disprove. SignalShield detects commercially influenced or AI-targeted manipulation. Suspicious sources are quarantined. Only after the evidence clears an explainable Trust Score does a human get the option to provision a separate Executor.

## 90-second demo

**0–15 sec — problem:** Explain that webpages can contain ads, affiliate incentives, hidden/off-screen text, deceptive urgency, or instructions written specifically to manipulate AI agents.

**15–35 sec — launch:** Enter a mission and launch the swarm. Point to three isolated browser cards. In live mode, open the Steel browser views to prove the browser infrastructure is real.

**35–55 sec — attack:** Point to SignalShield catching the AI-directed instruction / hidden text and the Adversary quarantining the suspicious source. Emphasize that sponsored/affiliate content is not automatically “false”; it is down-weighted and requires independent verification.

**55–70 sec — trust:** Open Evidence Graph. Show which claims have 2+ independent sources and why the Trust Score moved up or down.

**70–90 sec — human gate:** Return to Mission Control. Show that the Executor is physically absent/locked during research. Click Review & Approve. Only then is the separate Executor provisioned. Finish with: **“Research can recommend. Only a human can authorize execution.”**

## Why this fits the track

### Creativity

TrustMesh is not another browser wrapper or shopping bot. It treats the open web itself as an adversarial input surface and adds a browser-native zero-trust verification layer.

### Technical excellence

- Multiple isolated Steel browser sessions
- Observable live sessions
- Steel-powered page inspection
- Deterministic content-integrity detection
- Independent evidence model
- Explainable trust calculation
- Source quarantine
- Separate post-approval Executor session
- Explicit session lifecycle cleanup
- Optional autonomous discovery without making the app dependent on a second API key

### Wow factor

The UI turns invisible agent-security concepts into visible motion: three browser roles work in parallel, SignalShield lights up influence attempts, sources visibly drop into quarantine, the trust ring changes from evidence, and the Executor remains visibly locked until the user approves.
