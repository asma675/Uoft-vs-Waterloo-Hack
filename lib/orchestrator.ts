import { createSteelSession, releaseSteelSession, steelConfigured, type SteelSession } from "@/lib/steel"
import { connectBrowserSession } from "@/lib/browser"
import { anthropicConfigured } from "@/lib/anthropic"
import { runScout } from "@/lib/agents/scout"
import { runVerifier } from "@/lib/agents/verifier"
import type { AgentFinding } from "@/lib/agent-loop"
import { analyzeSource } from "@/lib/signal-shield"
import { calculateTrustScore, createDemoMission, type EvidenceItem, type Mission, type MissionEvent, type SourceRecord } from "@/lib/trustmesh"

const makeId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
const now = () => new Date().toISOString()

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

function sessionEvent(role: string): MissionEvent {
  return { id: makeId("evt"), at: now(), actor: role as MissionEvent["actor"], type: "session", message: `${role} isolated Steel session provisioned.` }
}

// Fallback agreement check for goals with no price/product to compare (pure
// factual questions, not shopping). Word-overlap heuristic, not semantic —
// good enough to catch "these two answers are clearly the same claim"
// without an extra LLM call.
function textsAgree(a: string, b: string): boolean {
  const wordsOf = (text: string) => new Set(text.toLowerCase().split(/\W+/).filter((word) => word.length > 3))
  const wordsA = wordsOf(a)
  const wordsB = wordsOf(b)
  if (wordsA.size === 0 || wordsB.size === 0) return false
  const overlap = [...wordsA].filter((word) => wordsB.has(word)).length
  return overlap / Math.min(wordsA.size, wordsB.size) >= 0.3
}

// What's needed after a mission completes, to serve the later /api/approve
// request: the real target URL for the Executor to navigate to, and the
// token the frontend must echo back. Steel session cleanup is client-driven
// (the dashboard's releaseSessions() reads agents[].sessionId on reset/next
// mission, with Steel's own inactivity timeout as a backstop) — this map
// only needs to bridge the one follow-up request a human makes after a
// mission completes.
interface PendingMission {
  winningUrl: string | null
  approvalToken: string
}

const pendingMissions = new Map<string, PendingMission>()

export function getPendingMission(missionId: string): PendingMission | undefined {
  return pendingMissions.get(missionId)
}

export function clearPendingMission(missionId: string): void {
  pendingMissions.delete(missionId)
}

export async function runMission(goal: string, wantsLive: boolean): Promise<Mission> {
  if (!wantsLive || !steelConfigured() || !anthropicConfigured()) {
    const mission = createDemoMission(goal)
    if (wantsLive) {
      const missing = [!steelConfigured() && "STEEL_API_KEY", !anthropicConfigured() && "ANTHROPIC_API_KEY"].filter(Boolean).join(" and ")
      mission.notices = [`Live mode was requested, but ${missing} is not configured. TrustMesh safely fell back to the complete demo workflow.`]
    }
    return mission
  }

  const base = createDemoMission(goal)
  base.mode = "steel"
  base.status = "running"
  base.researchMode = "ai-planned"
  base.events = [{ id: makeId("evt"), at: now(), actor: "system", type: "session", message: "Live Steel mission started." }]
  base.notices = []

  // Tracked the moment each session is created (not after the agent that
  // uses it finishes) — a session that's created successfully must never be
  // lost just because a sibling call in the same batch fails later.
  const sessions: SteelSession[] = []
  const openedSessions: Record<"scout" | "verifier" | "adversary", SteelSession | null> = { scout: null, verifier: null, adversary: null }

  try {
    base.agents = base.agents.map((agent) =>
      agent.role === "scout" || agent.role === "verifier"
        ? { ...agent, state: "browsing", source: "", finding: "", price: undefined, detail: "Researching independently" }
        : agent,
    )

    const [scoutOutcome, verifierOutcome] = await Promise.allSettled([
      (async () => {
        const session = await createSteelSession()
        sessions.push(session)
        openedSessions.scout = session
        base.events.push(sessionEvent("scout"))
        const browser = await connectBrowserSession(session)
        return runScout(goal, browser)
      })(),
      (async () => {
        const session = await createSteelSession()
        sessions.push(session)
        openedSessions.verifier = session
        base.events.push(sessionEvent("verifier"))
        const browser = await connectBrowserSession(session)
        return runVerifier(goal, browser)
      })(),
    ])

    const scoutFinding: AgentFinding | null = scoutOutcome.status === "fulfilled" ? scoutOutcome.value.finding : null
    const verifierFinding: AgentFinding | null = verifierOutcome.status === "fulfilled" ? verifierOutcome.value.finding : null

    base.events.push(
      { id: makeId("evt"), at: now(), actor: "scout", type: "research", message: scoutFinding ? `Scout found a candidate: ${scoutFinding.summary}` : "Scout could not find a confident answer." },
      { id: makeId("evt"), at: now(), actor: "verifier", type: "verification", message: verifierFinding ? `Verifier independently found: ${verifierFinding.summary}` : "Verifier could not find a confident answer." },
    )

    // --- Adversary: screen the actual pages Scout/Verifier used ---
    base.agents = base.agents.map((agent) => (agent.role === "adversary" ? { ...agent, state: "browsing" } : agent))

    const adversarySession = await createSteelSession()
    sessions.push(adversarySession)
    openedSessions.adversary = adversarySession
    base.events.push(sessionEvent("adversary"))
    const adversaryBrowser = await connectBrowserSession(adversarySession)

    const candidates: Array<{ role: "scout" | "verifier"; finding: AgentFinding }> = []
    if (scoutFinding) candidates.push({ role: "scout", finding: scoutFinding })
    if (verifierFinding) candidates.push({ role: "verifier", finding: verifierFinding })

    const sources: SourceRecord[] = []
    for (const candidate of candidates) {
      try {
        const snapshot = await adversaryBrowser.navigate(candidate.finding.sourceUrl)
        sources.push(
          analyzeSource({
            id: `src-${candidate.role}`,
            url: candidate.finding.sourceUrl,
            title: snapshot.title || hostOf(candidate.finding.sourceUrl),
            markdown: snapshot.text,
            redirectedUrl: snapshot.url !== candidate.finding.sourceUrl ? snapshot.url : undefined,
            role: candidate.role,
          }),
        )
      } catch (error) {
        sources.push({
          id: `src-${candidate.role}`,
          url: candidate.finding.sourceUrl,
          host: hostOf(candidate.finding.sourceUrl),
          title: hostOf(candidate.finding.sourceUrl),
          role: candidate.role,
          status: "review",
          legitimacy: 35,
          summary: "Adversary could not re-inspect this source.",
          reason: error instanceof Error ? error.message : "Unknown screening failure",
          signals: [],
        })
      }
    }
    await adversaryBrowser.close()

    const allSignals = sources.flatMap((source) => source.signals)
    const flaggedSource = sources.find((source) => source.status === "quarantined")
    base.sources = sources
    base.signals = allSignals
    base.quarantinedCount = sources.filter((source) => source.status === "quarantined").length
    base.threat = {
      detected: allSignals.some((signal) => signal.severity === "critical" || signal.severity === "high"),
      host: flaggedSource?.host ?? sources[0]?.host ?? "none",
      reason: flaggedSource?.reason ?? "No critical source required quarantine.",
    }
    base.events.push({
      id: makeId("evt"),
      at: now(),
      actor: "signalshield",
      type: "threat",
      message: `SignalShield inspected ${sources.length} source${sources.length === 1 ? "" : "s"} and produced ${allSignals.length} integrity finding${allSignals.length === 1 ? "" : "s"}.`,
    })

    // --- Compare Scout vs. Verifier, build evidence ---
    const scoutSource = sources.find((source) => source.role === "scout")
    const verifierSource = sources.find((source) => source.role === "verifier")
    const scoutUsable = scoutFinding && scoutSource?.status !== "quarantined" ? scoutFinding : null
    const verifierUsable = verifierFinding && verifierSource?.status !== "quarantined" ? verifierFinding : null

    const evidence: EvidenceItem[] = []
    let winningFinding: AgentFinding | null = null
    let recommendedAction = "Not enough independently-verified evidence to recommend an action yet."

    if (scoutUsable && verifierUsable) {
      const hasStructuredSignal = scoutUsable.price != null || verifierUsable.price != null || Boolean(scoutUsable.product) || Boolean(verifierUsable.product)
      const bothHavePrice = scoutUsable.price != null && verifierUsable.price != null
      const pricesAgree = !bothHavePrice || Math.abs(scoutUsable.price! - verifierUsable.price!) <= 0.15 * Math.max(scoutUsable.price!, verifierUsable.price!)
      const productsAgree = !scoutUsable.product || !verifierUsable.product || scoutUsable.product.trim().toLowerCase() === verifierUsable.product.trim().toLowerCase()
      const agree = hasStructuredSignal ? pricesAgree && productsAgree : textsAgree(`${scoutUsable.summary} ${scoutUsable.detail}`, `${verifierUsable.summary} ${verifierUsable.detail}`)

      if (agree) {
        winningFinding = scoutUsable.price != null && verifierUsable.price != null && verifierUsable.price < scoutUsable.price ? verifierUsable : scoutUsable
        evidence.push({
          id: "ev-agreement",
          claim: winningFinding.product ?? "Claim",
          value: winningFinding.price != null ? `$${winningFinding.price.toFixed(2)}` : winningFinding.summary,
          sources: 2,
          status: "confirmed",
          sourceIds: [scoutSource?.id, verifierSource?.id].filter((id): id is string => Boolean(id)),
          explanation: "Scout and Verifier independently reported the same finding.",
        })
        recommendedAction = `Stage ${winningFinding.product ?? "the verified finding"} from ${hostOf(winningFinding.sourceUrl)}${winningFinding.price != null ? ` at $${winningFinding.price.toFixed(2)}` : ""} for approval.`
      } else {
        winningFinding = scoutUsable
        evidence.push({
          id: "ev-disagreement",
          claim: "Scout vs. Verifier agreement",
          value: "Findings disagree",
          sources: 2,
          status: "warning",
          sourceIds: [scoutSource?.id, verifierSource?.id].filter((id): id is string => Boolean(id)),
          explanation: "Independent sources produced conflicting findings — human review recommended.",
        })
        recommendedAction = "Scout and Verifier disagree — human review recommended before proceeding."
      }
    } else if (scoutUsable || verifierUsable) {
      winningFinding = scoutUsable ?? verifierUsable
      const soleSource = scoutUsable ? scoutSource : verifierSource
      evidence.push({
        id: "ev-single-source",
        claim: winningFinding!.product ?? "Finding",
        value: winningFinding!.price != null ? `$${winningFinding!.price.toFixed(2)}` : winningFinding!.summary,
        sources: 1,
        status: "warning",
        sourceIds: soleSource ? [soleSource.id] : [],
        explanation: "Only one independent source could be verified — confidence is limited.",
      })
      recommendedAction = `Only one independent source could be verified (${hostOf(winningFinding!.sourceUrl)}) — confidence is limited.`
    }

    if (base.quarantinedCount) {
      evidence.push({
        id: "ev-injection",
        claim: "Manipulation attempt",
        value: "Quarantined",
        sources: 1,
        status: "blocked",
        sourceIds: flaggedSource ? [flaggedSource.id] : [],
        explanation: base.threat.reason,
      })
    }

    base.evidence = evidence
    base.recommendedAction = recommendedAction

    const actionRisk: Mission["actionRisk"] = base.quarantinedCount ? "high" : winningFinding?.price != null ? "medium" : "low"
    base.actionRisk = actionRisk

    const { score, factors } = calculateTrustScore(evidence, sources, allSignals, actionRisk)
    base.trustScore = score
    base.confidence = score
    base.trustFactors = factors

    base.events.push(
      { id: makeId("evt"), at: now(), actor: "verifier", type: "verification", message: `${evidence.filter((item) => item.status === "confirmed").length} evidence item(s) confirmed after cross-source comparison.` },
      { id: makeId("evt"), at: now(), actor: "adversary", type: "threat", message: `${base.quarantinedCount} source${base.quarantinedCount === 1 ? "" : "s"} quarantined from consensus.` },
      { id: makeId("evt"), at: now(), actor: "system", type: "score", message: `Explainable Trust Score resolved to ${score}/100 against a ${base.threshold}/100 review threshold.` },
    )

    base.agents = base.agents.map((agent) => {
      if (agent.role === "executor") {
        return { ...agent, state: "locked", source: "", finding: "Action staged", price: winningFinding?.price, detail: "LOCKED · waiting for explicit human approval" }
      }
      if (agent.role === "adversary") {
        return {
          ...agent,
          state: flaggedSource ? "quarantined" : "verified",
          source: flaggedSource?.host ?? "",
          finding: flaggedSource ? "Manipulation detected" : "No manipulation detected",
          detail: flaggedSource ? (flaggedSource.reason ?? "Integrity policy triggered") : "Screened all sources — no manipulation found.",
          sessionId: openedSessions.adversary?.id,
          debugUrl: openedSessions.adversary?.debugUrl ?? openedSessions.adversary?.sessionViewerUrl,
        }
      }

      const source = agent.role === "scout" ? scoutSource : verifierSource
      const finding = agent.role === "scout" ? scoutFinding : verifierFinding
      const session = openedSessions[agent.role]
      if (!source || !finding) {
        return { ...agent, state: "verified", finding: "No confident answer found", detail: "Agent could not complete research", sessionId: session?.id, debugUrl: session?.debugUrl ?? session?.sessionViewerUrl }
      }
      return {
        ...agent,
        state: source.status === "quarantined" ? "quarantined" : "verified",
        source: source.host,
        finding: source.status === "quarantined" ? "Source quarantined" : (finding.product ?? finding.summary),
        detail: source.status === "quarantined" ? (source.reason ?? "Integrity policy triggered") : source.summary,
        price: finding.price,
        sessionId: session?.id,
        debugUrl: session?.debugUrl ?? session?.sessionViewerUrl,
      }
    })

    base.status = "awaiting_approval"
    pendingMissions.set(base.id, { winningUrl: winningFinding?.sourceUrl ?? null, approvalToken: base.approvalToken })
    return base
  } catch (error) {
    await Promise.allSettled(sessions.map((session) => releaseSteelSession(session.id)))
    const message = `Mission failed: ${error instanceof Error ? error.message : String(error)}`
    base.status = "cancelled"
    base.recommendedAction = message
    base.notices = [...(base.notices ?? []), message]
    return base
  }
}
