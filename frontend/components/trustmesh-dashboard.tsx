"use client"

import * as React from "react"
import {
  Activity,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  FileSearch,
  Fingerprint,
  GitBranch,
  Globe2,
  History,
  LockKeyhole,
  Menu,
  Moon,
  Play,
  Radar,
  RefreshCw,
  Search,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Sun,
  TerminalSquare,
  UserCheck,
  X,
  Zap,
} from "lucide-react"

import {
  DEFAULT_GOAL,
  createDemoMission,
  type BrowserAgent,
  type Mission,
  type SignalFinding,
} from "@/shared/trustmesh"

type View = "mission" | "fleet" | "evidence" | "security"
type RunStage = "idle" | "launching" | "researching" | "verifying" | "complete"
type Health = { steel: "configured" | "demo"; aiResearch: "configured" | "optional"; virusTotal?: "configured" | "optional" }
type VirusTotalResult = { url: string; status: string; stats: Record<string, number>; permalink: string }

const navigation: { id: View; label: string }[] = [
  { id: "mission", label: "Mission" },
  { id: "fleet", label: "Sessions" },
  { id: "evidence", label: "Evidence" },
  { id: "security", label: "SignalShield" },
]

const stageCopy: Record<RunStage, string> = {
  idle: "Ready",
  launching: "Provisioning isolated browser identities",
  researching: "Independent agents are browsing",
  verifying: "SignalShield is verifying evidence",
  complete: "Research sealed — human decision required",
}

const signalLabels: Record<SignalFinding["category"], string> = {
  advertising: "Advertising",
  sponsored: "Sponsored",
  affiliate: "Affiliate",
  promotional: "Promotional",
  ai_directed_instruction: "AI-directed",
  hidden_text: "Hidden text",
  prompt_injection: "Prompt injection",
  deceptive_content: "Deceptive",
  conflict: "Conflict",
  suspicious_redirect: "Redirect",
}

function Mark() {
  return (
    <span className="tm-logo-mark" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  )
}

function AgentDot({ role }: { role: BrowserAgent["role"] }) {
  return <i className={`agent-dot agent-dot--${role}`} aria-hidden="true" />
}

function StatusTag({ state }: { state: BrowserAgent["state"] }) {
  const labels: Record<BrowserAgent["state"], string> = {
    queued: "QUEUED",
    browsing: "BROWSING",
    verified: "VERIFIED",
    quarantined: "QUARANTINED",
    locked: "LOCKED",
    ready: "READY",
    executing: "EXECUTING",
    released: "RELEASED",
  }
  return <span className={`status-tag status-tag--${state}`}>{labels[state]}</span>
}

function HeroBrowserVisual({ mission, stage }: { mission: Mission; stage: RunStage }) {
  const scout = mission.agents.find((agent) => agent.role === "scout") ?? mission.agents[0]
  const verifier = mission.agents.find((agent) => agent.role === "verifier") ?? mission.agents[1]
  const adversary = mission.agents.find((agent) => agent.role === "adversary") ?? mission.agents[2]
  const active = stage !== "idle"

  return (
    <div className={`hero-visual ${active ? "is-running" : ""}`}>
      <div className="pixel-field" aria-hidden="true" />
      <div className="hero-tag hero-tag--left">TRUSTMESH_SWARM</div>
      <div className="hero-tag hero-tag--right">STEEL_BROWSER</div>

      <div className="hero-window hero-window--agent">
        <div className="hero-window__toolbar"><span><i /><i /><i /></span><b>mission://zero-trust</b></div>
        <div className="hero-chat">
          <div className="chat-row"><span className="chat-avatar"><UserCheck /></span><p>Find the safest valid result, not just the first result.</p></div>
          <div className="chat-row"><span className="chat-avatar is-blue"><Sparkles /></span><p><b>{scout?.label}</b> found a candidate. <b>{verifier?.label}</b> is independently checking it.</p></div>
          <div className="chat-row"><span className="chat-avatar is-red"><ShieldAlert /></span><p><b>{adversary?.label}</b> {adversary?.state === "quarantined" ? "quarantined manipulative evidence." : "is trying to disprove it."}</p></div>
        </div>
        <div className="hero-window__status"><span className="live-dot" />{stageCopy[stage]}</div>
      </div>

      <div className="hero-window hero-window--browser">
        <div className="hero-window__toolbar"><span><i /><i /><i /></span><b>{verifier?.source ?? "independent-source.example"}</b></div>
        <div className="browser-scan-surface">
          <div className="scan-beam" />
          <div className="scan-copy"><small>SIGNALSHIELD</small><b>{mission.signals.length ? `${mission.signals.length} influence signals` : "content integrity clear"}</b><span>web content = untrusted evidence</span></div>
          <div className="scan-score"><span>TRUST</span><b>{mission.trustScore}</b></div>
          <div className="browser-gridlines" />
        </div>
      </div>
    </div>
  )
}

function MiniBrowser({ agent, active }: { agent: BrowserAgent; active: boolean }) {
  const roleIcon = agent.role === "scout" ? Search : agent.role === "verifier" ? Fingerprint : agent.role === "adversary" ? ShieldAlert : LockKeyhole
  const Icon = roleIcon
  return (
    <article className={`agent-card agent-card--${agent.role} ${active ? "is-active" : ""}`}>
      <header>
        <div className="agent-title"><span className="agent-icon"><Icon /></span><span><b>{agent.label}</b><small>{agent.id}</small></span></div>
        <StatusTag state={agent.state} />
      </header>
      <div className="agent-browser">
        <div className="browser-top"><span><i /><i /><i /></span><b>{agent.source}</b></div>
        <div className="browser-content">
          {active && <span className="agent-scanline" />}
          <span className="browser-glyph">{agent.role === "executor" ? <LockKeyhole /> : agent.state === "quarantined" ? <ShieldAlert /> : <Globe2 />}</span>
          <div><small>{agent.objective}</small><strong>{agent.finding}</strong><p>{agent.detail}</p></div>
          {typeof agent.price === "number" && <em>${agent.price.toLocaleString("en-US")}</em>}
          {agent.state === "quarantined" && <div className="quarantine-strip">UNTRUSTED SOURCE ISOLATED</div>}
          {agent.state === "locked" && <div className="lock-strip"><LockKeyhole /> HUMAN APPROVAL REQUIRED</div>}
        </div>
      </div>
      <footer><span><AgentDot role={agent.role} />isolated browser</span>{agent.debugUrl ? <a href={agent.debugUrl} target="_blank" rel="noreferrer">Open live <ExternalLink /></a> : <span>demo replay</span>}</footer>
    </article>
  )
}

function TrustGauge({ mission }: { mission: Mission }) {
  return (
    <div className="trust-gauge" style={{ "--score": mission.trustScore } as React.CSSProperties}>
      <div><strong>{mission.trustScore}</strong><span>TRUST SCORE</span><small>threshold {mission.threshold}</small></div>
    </div>
  )
}

function SignalPills({ signals }: { signals: SignalFinding[] }) {
  if (!signals.length) return <span className="signal-clear"><ShieldCheck /> NO MATERIAL SIGNALS</span>
  return <div className="signal-pills">{signals.slice(0, 7).map((signal) => <span key={signal.id} className={`signal-pill signal-pill--${signal.severity}`} title={signal.detail}>{signalLabels[signal.category]}</span>)}</div>
}

function SourceLinks({ mission, sourceIds, compact = false }: { mission: Mission; sourceIds?: string[]; compact?: boolean }) {
  const allowed = sourceIds?.length ? new Set(sourceIds) : null
  const sources = mission.sources.filter((source) => !allowed || allowed.has(source.id))
  if (!sources.length) return <span className="source-links-empty">No source URL available</span>
  return <div className={compact ? "source-links source-links--compact" : "source-links"}>{sources.map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer noopener" title={source.url}><Globe2 /><span>{source.host}</span><ExternalLink /></a>)}</div>
}

function MissionApp({
  mission,
  stage,
  goal,
  setGoal,
  liveMode,
  setLiveMode,
  runMission,
  reset,
  approve,
  reject,
  approvalBusy,
  error,
  setError,
}: {
  mission: Mission
  stage: RunStage
  goal: string
  setGoal: (value: string) => void
  liveMode: boolean
  setLiveMode: (value: boolean) => void
  runMission: () => void
  reset: () => void
  approve: () => void
  reject: () => void
  approvalBusy: boolean
  error: string
  setError: (value: string) => void
}) {
  const researchAgents = mission.agents.filter((agent) => agent.role !== "executor")
  const executor = mission.agents.find((agent) => agent.role === "executor") ?? mission.agents[3]
  const running = ["launching", "researching", "verifying"].includes(stage)
  const canApprove = stage === "complete" && mission.status === "awaiting_approval" && mission.trustScore >= mission.threshold
  const [confirmOpen, setConfirmOpen] = React.useState(false)

  return (
    <section className="product-section" id="control-plane">
      <div className="section-heading-grid">
        <div><span className="kicker">MISSION CONTROL</span><h2>Three browsers research.<br />One human decides.</h2></div>
        <p>Every source is treated as untrusted evidence. Research roles cannot authorize execution, and suspicious content is quarantined before consensus.</p>
      </div>

      <div className="mission-console">
        <div className="console-header"><span><TerminalSquare /> ZERO-TRUST CONTROL PLANE</span><span className={mission.mode === "steel" ? "mode-chip is-live" : "mode-chip"}>{mission.mode === "steel" ? "STEEL LIVE" : "DEMO MODE"}</span></div>
        <div className="mission-input-row">
          <textarea value={goal} onChange={(event) => setGoal(event.target.value)} rows={3} aria-label="Mission goal" placeholder="Describe the browser mission..." />
          <div className="mission-actions">
            <label className="toggle-row"><input type="checkbox" checked={liveMode} onChange={(event) => setLiveMode(event.target.checked)} /><span className="switch-ui"><i /></span><b>LIVE STEEL</b></label>
            <button className="primary-cta" onClick={runMission} disabled={!goal.trim() || running}>{running ? <><span className="spinner" /> RUNNING</> : <><Play /> LAUNCH SWARM</>}</button>
            <button className="ghost-cta" onClick={reset}><RefreshCw /> RESET</button>
          </div>
        </div>
        <div className="console-status"><span><i className={running ? "live-dot" : "idle-dot"} />{stageCopy[stage]}</span><code>{mission.id}</code></div>
      </div>

      {error && <div className="error-banner"><ShieldAlert /><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss error"><X /></button></div>}

      <div className="agent-grid">{researchAgents.map((agent, index) => <MiniBrowser key={agent.id} agent={agent} active={running && index <= (stage === "launching" ? 0 : stage === "researching" ? 2 : 3)} />)}</div>

      <div className="signal-bar">
        <div><ShieldCheck /><span><small>SIGNALSHIELD</small><b>{mission.signals.length ? `${mission.signals.length} influence signals detected` : "Content integrity clear"}</b></span></div>
        <SignalPills signals={mission.signals} />
        <strong className="quarantine-number">{mission.quarantinedCount.toString().padStart(2, "0")}<small>QUARANTINED</small></strong>
      </div>

      <div className="decision-grid">
        <div className="evidence-summary">
          <span className="kicker"><GitBranch /> VERIFIED EVIDENCE</span>
          <div className="evidence-list">{mission.evidence.slice(0, 5).map((item) => <div key={item.id} className={`evidence-item evidence-item--${item.status}`}><span>{item.status === "confirmed" ? <Check /> : <ShieldAlert />}{item.claim}</span><b>{item.value}</b><small>{item.sources} source{item.sources === 1 ? "" : "s"}</small></div>)}</div>
          <div className="staged-action"><small>STAGED ACTION</small><p>{mission.recommendedAction}</p><SourceLinks mission={mission} compact /></div>
        </div>
        <TrustGauge mission={mission} />
        <div className="approval-box">
          <div className="approval-icon">{mission.status === "approved" ? <CheckCircle2 /> : mission.status === "rejected" ? <X /> : <UserCheck />}</div>
          <span className="kicker">HUMAN CHECKPOINT</span>
          <h3>{mission.status === "approved" ? "Executor unlocked" : mission.status === "rejected" ? "Action rejected" : mission.trustScore >= mission.threshold ? "Ready for review" : "Below trust threshold"}</h3>
          <p>{executor.detail}</p>
          {mission.status === "awaiting_approval" ? <div className="approval-actions"><button className="ghost-cta danger" onClick={reject} disabled={stage !== "complete" || approvalBusy}><X /> REJECT</button><button className="primary-cta" onClick={() => setConfirmOpen(true)} disabled={!canApprove || approvalBusy}><ShieldCheck /> REVIEW & APPROVE</button></div> : <div className={`decision-stamp decision-stamp--${mission.status}`}>{mission.status === "approved" ? <CheckCircle2 /> : <X />}{mission.status.toUpperCase()}</div>}
        </div>
      </div>

      <div className="executor-row">
        <div className="executor-label"><span className="kicker">SEPARATE EXECUTION PLANE</span><h3>Executor stays dark until a person says go.</h3><p>Research sessions can propose an action. They cannot provision or authorize the Executor.</p></div>
        <MiniBrowser agent={executor} active={mission.status === "approved"} />
      </div>

      {confirmOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setConfirmOpen(false) }}><div className="approval-modal" role="dialog" aria-modal="true" aria-labelledby="approval-title"><button className="modal-close" onClick={() => setConfirmOpen(false)} aria-label="Close"><X /></button><div className="modal-icon"><UserCheck /></div><span className="kicker">HUMAN AUTHORIZATION</span><h2 id="approval-title">Provision the separate Executor?</h2><p>Research agents cannot authorize this step. Approval unlocks a separate execution session for only the staged action.</p><div className="modal-stats"><span>Trust Score <b>{mission.trustScore}/100</b></span><span>Threshold <b>{mission.threshold}/100</b></span><span>Quarantined <b>{mission.quarantinedCount}</b></span></div><div className="modal-action"><small>APPROVED SCOPE</small><p>{mission.recommendedAction}</p></div><div className="modal-buttons"><button className="ghost-cta" onClick={() => setConfirmOpen(false)}>KEEP LOCKED</button><button className="primary-cta" onClick={() => { setConfirmOpen(false); approve() }}><ShieldCheck /> APPROVE EXECUTOR</button></div></div></div>}
    </section>
  )
}

function FleetView({ mission, onRelease }: { mission: Mission; onRelease: () => void }) {
  const live = mission.agents.filter((agent) => agent.debugUrl)
  return <section className="subpage"><div className="subpage-heading"><span className="kicker">SESSIONS API</span><h1>Isolated browser fleet.</h1><p>Each research role gets separate browser state. The Executor is provisioned only after explicit approval.</p><button className="ghost-cta" onClick={onRelease} disabled={!mission.agents.some((agent) => agent.sessionId)}>RELEASE SESSIONS</button></div>{live.length > 0 && <div className="live-grid">{live.map((agent) => <article className="live-frame" key={agent.id}><header><span><AgentDot role={agent.role} />{agent.label}</span><a href={agent.debugUrl} target="_blank" rel="noreferrer">OPEN LIVE <ExternalLink /></a></header><iframe src={agent.debugUrl} title={`${agent.label} Steel session`} loading="lazy" referrerPolicy="no-referrer" /></article>)}</div>}<div className="steel-table"><div className="steel-table__row steel-table__head"><span>AGENT</span><span>ISOLATION</span><span>SESSION</span><span>SOURCE</span><span>STATE</span></div>{mission.agents.map((agent) => <div className="steel-table__row" key={agent.id}><span><AgentDot role={agent.role} /><b>{agent.label}</b></span><span>{agent.role === "executor" && !agent.sessionId ? "Not provisioned" : "Ephemeral profile"}</span><code>{agent.sessionId ? `${agent.sessionId.slice(0, 10)}…` : "—"}</code><span>{agent.source}</span><StatusTag state={agent.state} /></div>)}</div><div className="api-ribbon"><Zap /><span><b>Powered by Steel browser infrastructure</b><small>isolated sessions · live observability · explicit cleanup</small></span><code>POST /v1/sessions</code></div></section>
}

function EvidenceView({ mission }: { mission: Mission }) {
  return (
    <section className="subpage">
      <div className="subpage-heading"><span className="kicker">PROVENANCE LEDGER</span><h1>Every conclusion has a trail.</h1><p>Independent evidence is visible, disagreements are preserved, and every live research result exposes the exact source URL used.</p></div>
      <div className="evidence-overview"><div className="consensus-core"><ShieldCheck /><b>TRUSTED<br />CONSENSUS</b><span>{mission.trustScore}/100</span></div>{mission.sources.slice(0, 4).map((source, i) => <a href={source.url} target="_blank" rel="noreferrer noopener" key={source.id} className={`source-node source-node--${source.status}`} style={{ "--i": i } as React.CSSProperties}><Globe2 /><b>{source.host}</b><small>{source.status} · open source</small></a>)}</div>
      <div className="steel-table evidence-table"><div className="steel-table__row steel-table__head"><span>CLAIM</span><span>RESOLVED VALUE</span><span>SOURCES</span><span>VERDICT</span><span>EXPLANATION</span></div>{mission.evidence.map((item) => <div className="steel-table__row" key={item.id}><span><FileSearch />{item.claim}</span><b>{item.value}</b><span><SourceLinks mission={mission} sourceIds={item.sourceIds} compact /></span><span className={`verdict verdict--${item.status}`}>{item.status}</span><span>{item.explanation ?? "—"}</span></div>)}</div>
      <div className="source-directory"><span className="kicker">SOURCE DIRECTORY</span><SourceLinks mission={mission} /></div>
      <div className="factor-grid">{mission.trustFactors.map((factor) => <article key={factor.id}><span>{factor.label}</span><b className={factor.impact >= 0 ? "positive" : "negative"}>{factor.impact >= 0 ? "+" : ""}{factor.impact}</b><p>{factor.detail}</p></article>)}</div>
    </section>
  )
}

function VirusTotalPanel({ mission }: { mission: Mission }) {
  const [url, setUrl] = React.useState(mission.sources[0]?.url ?? "")
  const [result, setResult] = React.useState<VirusTotalResult | null>(null)
  const [error, setError] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  async function scan() {
    setBusy(true)
    setError("")
    setResult(null)
    try {
      const response = await fetch("/api/virustotal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      })
      const data = await response.json() as VirusTotalResult & { error?: string }
      if (!response.ok) throw new Error(data.error ?? "VirusTotal scan failed.")
      setResult(data)
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "VirusTotal scan failed.")
    } finally {
      setBusy(false)
    }
  }

  const malicious = result?.stats.malicious ?? 0
  const suspicious = result?.stats.suspicious ?? 0
  const detections = malicious + suspicious
  return <article className="vt-panel"><div className="vt-panel__heading"><span><span className="kicker"><ShieldCheck /> THREAT INTELLIGENCE</span><h2>VirusTotal URL scan</h2><p>Check a source against multiple security engines before trusting its content. The API key stays server-side.</p></span><span className="vt-badge">VT / API v3</span></div><div className="vt-form"><input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com" type="url" aria-label="URL to scan with VirusTotal" /><button className="primary-cta" onClick={() => void scan()} disabled={busy || !url.trim()}>{busy ? <><RefreshCw className="spin" /> SCANNING</> : <><Radar /> SCAN URL</>}</button></div>{error && <p className="vt-error" role="alert">{error}</p>}{result && <div className="vt-result"><div className={`vt-verdict ${detections ? "vt-verdict--danger" : "vt-verdict--safe"}`}><ShieldCheck /><span><small>VIRUSTOTAL VERDICT</small><b>{detections ? `${detections} detection${detections === 1 ? "" : "s"}` : "No detections reported"}</b></span></div><div className="vt-stats"><span><b>{result.stats.harmless ?? 0}</b><small>harmless</small></span><span><b>{malicious}</b><small>malicious</small></span><span><b>{suspicious}</b><small>suspicious</small></span><span><b>{result.stats.undetected ?? 0}</b><small>undetected</small></span></div><div className="vt-result__footer"><span>STATUS: {result.status.toUpperCase()} · {result.url}</span><a href={result.permalink} target="_blank" rel="noreferrer">OPEN FULL REPORT <ExternalLink /></a></div></div>}</article>
}

function SecurityView({ mission }: { mission: Mission }) {
  return <section className="subpage"><div className="subpage-heading"><span className="kicker">SIGNALSHIELD</span><h1>Assume the web is trying to influence the agent.</h1><p>Commercial influence is not automatically false. It becomes a verification signal. Critical AI-directed manipulation can quarantine a source.</p></div><VirusTotalPanel mission={mission} /><div className="security-grid"><article className="threat-summary"><Radar /><span className="kicker">CURRENT THREAT</span><h2>{mission.threat.detected ? mission.threat.host : "No critical threat"}</h2><p>{mission.threat.reason}</p></article><div className="signal-stack">{mission.signals.length ? mission.signals.map((signal) => <article key={signal.id} className={`signal-record signal-record--${signal.severity}`}><span><ShieldAlert /><b>{signal.label}</b><small>{signal.category.replaceAll("_", " ")}</small></span><strong>{signal.severity}</strong><p>{signal.detail}</p>{signal.evidence && <code>{signal.evidence}</code>}</article>) : <article className="signal-record"><ShieldCheck /><b>No material signals detected.</b></article>}</div></div><div className="practice-section"><div className="practice-heading"><span className="kicker"><ShieldCheck /> SECURITY OPERATING PRACTICES</span><h2>Controls that keep evidence from becoming authority.</h2><p>Use these principles whenever an agent reads untrusted pages or prepares an external action.</p></div><div className="practice-grid"><article><span className="practice-icon"><ShieldAlert /></span><h3>Treat content as untrusted</h3><p>Never follow instructions found in webpages, ads, emails, or documents. Extract claims as data and keep them separate from agent policy.</p></article><article><span className="practice-icon"><LockKeyhole /></span><h3>Isolate every role</h3><p>Use separate browser sessions, storage, credentials, and network permissions for discovery, verification, adversarial review, and execution.</p></article><article><span className="practice-icon"><Settings2 /></span><h3>Apply least privilege</h3><p>Give agents only the tools and access needed for the current step. Keep payments, account changes, downloads, and form submission disabled by default.</p></article><article><span className="practice-icon"><GitBranch /></span><h3>Corroborate independently</h3><p>Require important claims to agree across independent sources. Preserve disagreements instead of averaging them into false confidence.</p></article><article><span className="practice-icon"><UserCheck /></span><h3>Require human approval</h3><p>Show the exact staged action, evidence, trust score, and risk before provisioning an executor. Approval must be explicit and scoped.</p></article><article><span className="practice-icon"><History /></span><h3>Audit and clean up</h3><p>Record findings, decisions, and session events. Expire tokens, release browser sessions, and retain only the data required for review.</p></article></div></div><div className="steel-table"><div className="steel-table__row steel-table__head"><span>SOURCE</span><span>ROLE</span><span>LEGITIMACY</span><span>STATUS</span><span>WHY</span></div>{mission.sources.map((source) => <div className="steel-table__row" key={source.id}><span><a className="table-source-link" href={source.url} target="_blank" rel="noreferrer noopener"><Globe2 /><b>{source.host}</b><ExternalLink /></a></span><span>{source.role}</span><span>{source.legitimacy}/100</span><span className={`source-status source-status--${source.status}`}>{source.status}</span><span>{source.reason ?? source.summary}</span></div>)}</div></section>
}

export function TrustMeshDashboard() {
  const [view, setView] = React.useState<View>("mission")
  const [theme, setTheme] = React.useState<"dark" | "light">("dark")
  const [mobileNav, setMobileNav] = React.useState(false)
  const [goal, setGoal] = React.useState(DEFAULT_GOAL)
  const [mission, setMission] = React.useState(() =>
    createDemoMission(DEFAULT_GOAL, {
      id: "TM-DEMO01",
      approvalToken: "APR-DEMO01",
      timestamp: "2026-09-13T12:00:00.000Z",
    }),
  )
  const [stage, setStage] = React.useState<RunStage>("idle")
  const [liveMode, setLiveMode] = React.useState(false)
  const [error, setError] = React.useState("")
  const [approvalBusy, setApprovalBusy] = React.useState(false)
  const [health, setHealth] = React.useState<Health | null>(null)
  const timers = React.useRef<number[]>([])

  React.useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  React.useEffect(() => {
    fetch("/api/health", { cache: "no-store" }).then((response) => response.json()).then((body) => setHealth(body as Health)).catch(() => undefined)
    return () => timers.current.forEach(window.clearTimeout)
  }, [])

  async function releaseSessions(targetMission = mission) {
    const sessionIds = targetMission.agents.map((agent) => agent.sessionId).filter((value): value is string => Boolean(value))
    if (!sessionIds.length) return
    try {
      await fetch("/api/sessions/release", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionIds }) })
      setMission((current) => ({ ...current, agents: current.agents.map((agent) => agent.sessionId ? { ...agent, state: "released", sessionId: undefined, debugUrl: undefined } : agent), events: [...current.events, { id: `evt-client-${Date.now()}`, at: new Date().toISOString(), actor: "system", type: "release", message: `${sessionIds.length} Steel session${sessionIds.length === 1 ? "" : "s"} released.` }] }))
    } catch {
      // Session timeout is still a safe backstop.
    }
  }

  async function runMission() {
    if (!goal.trim() || ["launching", "researching", "verifying"].includes(stage)) return
    timers.current.forEach(window.clearTimeout)
    timers.current = []
    setError("")
    setView("mission")
    setStage("launching")
    const previous = mission
    if (previous.mode === "steel") void releaseSessions(previous)
    setMission(createDemoMission(goal.trim()))
    timers.current.push(window.setTimeout(() => setStage("researching"), 650))
    timers.current.push(window.setTimeout(() => setStage("verifying"), 1750))

    try {
      const response = await fetch("/api/missions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ goal: goal.trim(), live: liveMode }) })
      const body = (await response.json()) as Mission & { error?: string }
      if (!response.ok) throw new Error(body.error ?? "Mission failed")
      setMission(body)
      setStage("complete")
    } catch (caught) {
      timers.current.forEach(window.clearTimeout)
      setStage("idle")
      setError(caught instanceof Error ? caught.message : "Could not start the mission")
    }
  }

  async function approve() {
    setApprovalBusy(true)
    setError("")
    try {
      const response = await fetch("/api/approve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ missionId: mission.id, approvalToken: mission.approvalToken, live: mission.mode === "steel", trustScore: mission.trustScore, threshold: mission.threshold }) })
      const body = await response.json() as { error?: string; executorSession?: { id: string; debugUrl?: string; sessionViewerUrl?: string }; message?: string }
      if (!response.ok) throw new Error(body.error ?? "Approval could not be recorded")
      setMission((current) => ({ ...current, status: "approved", agents: current.agents.map((agent) => agent.role === "executor" ? { ...agent, state: "ready", sessionId: body.executorSession?.id, debugUrl: body.executorSession?.debugUrl ?? body.executorSession?.sessionViewerUrl, detail: body.executorSession ? "UNLOCKED · separate Steel Executor session provisioned" : "UNLOCKED · demo execution scope staged" } : agent), events: [...current.events, { id: `evt-approve-${Date.now()}`, at: new Date().toISOString(), actor: "human", type: "approval", message: body.message ?? "Executor approved by a human." }] }))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Approval failed")
    } finally {
      setApprovalBusy(false)
    }
  }

  async function reject() {
    setApprovalBusy(true)
    try {
      await fetch("/api/reject", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ missionId: mission.id, approvalToken: mission.approvalToken }) })
      setMission((current) => ({ ...current, status: "rejected", agents: current.agents.map((agent) => agent.role === "executor" ? { ...agent, state: "locked", detail: "LOCKED · human rejected the staged action" } : agent), events: [...current.events, { id: `evt-reject-${Date.now()}`, at: new Date().toISOString(), actor: "human", type: "approval", message: "Human rejected the staged action. Executor remained locked." }] }))
    } finally {
      setApprovalBusy(false)
    }
  }

  function reset() {
    timers.current.forEach(window.clearTimeout)
    if (mission.mode === "steel") void releaseSessions(mission)
    setStage("idle")
    setMission(createDemoMission(goal))
    setError("")
  }

  return (
    <main className="steel-page">
      <div className="steel-frame">
        <div className="launch-bar"><span className="launch-icon"><Zap /></span><span>TRUSTMESH // STEEL HACKATHON</span><b>Zero-trust browsing is live</b><ChevronRight /></div>
        <header className="steel-nav">
          <button className="brand" onClick={() => setView("mission")}><Mark /><span>TrustMesh</span></button>
          <nav className={mobileNav ? "is-open" : ""}>{navigation.map((item) => <button key={item.id} className={view === item.id ? "is-active" : ""} onClick={() => { setView(item.id); setMobileNav(false) }}>{item.label}</button>)}</nav>
          <div className="nav-right"><span className="nav-stat"><ShieldCheck /> {mission.quarantinedCount} blocked</span><button className="theme-button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Toggle theme">{theme === "dark" ? <Sun /> : <Moon />}</button><button className="nav-dashboard" onClick={() => { setView("mission"); setTimeout(() => document.getElementById("control-plane")?.scrollIntoView({ behavior: "smooth" }), 0) }}>Launch Mission</button><button className="menu-button" onClick={() => setMobileNav((value) => !value)} aria-label="Menu"><Menu /></button></div>
        </header>

        {view === "mission" ? <>
          <section className="steel-hero">
            <div className="hero-copy"><span className="kicker">BROWSER SECURITY FOR AI AGENTS</span><h1>Zero-Trust<br />Browser Infrastructure<br />for AI Agents</h1><p>TrustMesh is a verification and safety layer that prevents one webpage, one source, or one agent from controlling a consequential browser action.</p><div className="hero-actions"><button className="primary-cta hero-primary" onClick={() => document.getElementById("control-plane")?.scrollIntoView({ behavior: "smooth" })}>START A MISSION <ArrowRight /></button><button className="ghost-cta" onClick={() => setView("fleet")}>VIEW BROWSER SWARM <Globe2 /></button></div></div>
            <HeroBrowserVisual mission={mission} stage={stage} />
          </section>
          <section className="hero-metrics"><div><b>03</b><span>Independent Research Agents</span></div><div><b>01</b><span>Human-Gated Executor</span></div><div><b>{mission.trustScore}/100</b><span>Explainable Trust Score</span></div></section>
          <MissionApp mission={mission} stage={stage} goal={goal} setGoal={setGoal} liveMode={liveMode} setLiveMode={setLiveMode} runMission={runMission} reset={reset} approve={approve} reject={reject} approvalBusy={approvalBusy} error={error} setError={setError} />
          <section className="principle-strip"><span>FIND</span><ChevronRight /><span>VERIFY</span><ChevronRight /><span>DISPROVE</span><ChevronRight /><span>SCORE TRUST</span><ChevronRight /><span>HUMAN APPROVAL</span><ChevronRight /><span>EXECUTE</span></section>
        </> : view === "fleet" ? <FleetView mission={mission} onRelease={() => void releaseSessions()} /> : view === "evidence" ? <EvidenceView mission={mission} /> : <SecurityView mission={mission} />}

        <footer className="steel-footer"><div><Mark /><b>TrustMesh</b><span>Don&apos;t trust your browser agent. Verify it.</span></div><div><span><Activity /> {health?.steel === "configured" ? "Steel API configured" : "Demo-ready"}</span><span>{health?.virusTotal === "configured" ? "VirusTotal connected" : "SignalShield ready"}</span><span>Web content is untrusted evidence, never authority.</span></div></footer>
      </div>
    </main>
  )
}
