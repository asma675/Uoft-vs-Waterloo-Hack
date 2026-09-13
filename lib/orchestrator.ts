import { aiResearchConfigured, planSources, synthesizeEvidence, type PlannedSource } from "@/lib/openai-research"
import { analyzeSource } from "@/lib/signal-shield"
import { createSteelSession, scrapeWithSteel, steelConfigured } from "@/lib/steel"
import {
  calculateTrustScore,
  createDemoMission,
  type BrowserAgent,
  type EvidenceItem,
  type Mission,
  type MissionEvent,
  type SourceRecord,
} from "@/lib/trustmesh"

const makeId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
const now = () => new Date().toISOString()

function extractUrls(text: string) {
  const matches = text.match(/https?:\/\/[^\s<>"')\]]+/gi) ?? []
  return [...new Set(matches.map((value) => value.replace(/[.,;:!?]+$/, "")))].slice(0, 4)
}

function fallbackEvidence(sources: SourceRecord[]): EvidenceItem[] {
  const trusted = sources.filter((source) => source.status !== "quarantined")
  const sharedHosts = trusted.map((source) => source.host)
  return [
    {
      id: "ev-live-access",
      claim: "Independent source access",
      value: `${trusted.length} usable source${trusted.length === 1 ? "" : "s"}`,
      sources: trusted.length,
      sourceIds: trusted.map((source) => source.id),
      status: trusted.length >= 2 ? "confirmed" : "warning",
      explanation: `SignalShield completed browser-side inspection for ${sharedHosts.join(", ") || "the supplied targets"}.`,
    },
    {
      id: "ev-live-integrity",
      claim: "Content integrity",
      value: sources.some((source) => source.status === "quarantined") ? "Manipulation isolated" : "No critical manipulation detected",
      sources: sources.length,
      sourceIds: sources.map((source) => source.id),
      status: sources.some((source) => source.status === "quarantined") ? "warning" : "confirmed",
      explanation: "This verdict is derived from deterministic SignalShield rules, not an invented model confidence percentage.",
    },
  ]
}

function sessionEvent(role: string): MissionEvent {
  return { id: makeId("evt"), at: now(), actor: role as MissionEvent["actor"], type: "session", message: `${role} isolated Steel session provisioned.` }
}

export async function runMission(goal: string, wantsLive: boolean): Promise<Mission> {
  if (!wantsLive || !steelConfigured()) {
    const mission = createDemoMission(goal)
    if (wantsLive && !steelConfigured()) {
      mission.notices = ["Live mode was requested, but STEEL_API_KEY is not configured. TrustMesh safely fell back to the complete demo workflow."]
    }
    return mission
  }

  const base = createDemoMission(goal)
  base.mode = "steel"
  base.status = "running"
  base.events = [{ id: makeId("evt"), at: now(), actor: "system", type: "session", message: "Live Steel mission started." }]
  base.notices = []

  const sessions = await Promise.all([createSteelSession(), createSteelSession(), createSteelSession()])
  const researchRoles: Array<Exclude<BrowserAgent["role"], "executor">> = ["scout", "verifier", "adversary"]
  base.agents = base.agents.map((agent, index) => {
    if (agent.role === "executor") return { ...agent, state: "locked", sessionId: undefined, debugUrl: undefined, detail: "LOCKED · executor is not provisioned before human approval" }
    const session = sessions[index]
    base.events.push(sessionEvent(agent.role))
    return { ...agent, state: "browsing", sessionId: session.id, debugUrl: session.debugUrl ?? session.sessionViewerUrl, finding: "Live browser ready", detail: "Isolated Steel session active" }
  })

  let plannedSources: PlannedSource[] = extractUrls(goal).map((url) => ({ url, title: new URL(url).hostname, why: "URL supplied directly in the mission goal." }))
  let actionRisk: Mission["actionRisk"] = "medium"

  if (plannedSources.length >= 1) {
    base.researchMode = "direct-url"
    base.events.push({ id: makeId("evt"), at: now(), actor: "scout", type: "research", message: `${plannedSources.length} user-supplied URL${plannedSources.length === 1 ? "" : "s"} selected for direct verification.` })
  } else if (aiResearchConfigured()) {
    const plan = await planSources(goal)
    plannedSources = plan.sources
    actionRisk = plan.actionRisk
    base.researchMode = "ai-planned"
    base.events.push({ id: makeId("evt"), at: now(), actor: "scout", type: "research", message: `Planner found ${plannedSources.length} independent sources; Steel will inspect the actual pages.` })
  } else {
    base.researchMode = "demo"
    base.notices?.push("Steel sessions are live, but autonomous discovery also needs OPENAI_API_KEY. Add explicit URLs to the mission or configure OpenAI web search for fully autonomous live research.")
    base.events.push({ id: makeId("evt"), at: now(), actor: "system", type: "research", message: "No URLs or AI planner available; retaining deterministic demo evidence while live sessions remain observable." })
    return {
      ...base,
      status: "awaiting_approval",
      agents: base.agents.map((agent) => (agent.role === "executor" ? agent : { ...agent, state: agent.role === "adversary" ? "quarantined" : "verified" })),
    }
  }

  if (!plannedSources.length) {
    base.notices?.push("No usable web sources were returned. Executor remains locked.")
    base.status = "awaiting_approval"
    base.trustScore = 32
    base.confidence = 32
    base.recommendedAction = "Do not execute. Provide additional sources or refine the mission."
    return base
  }

  const selected = plannedSources.slice(0, 3)
  const scrapeResults = await Promise.allSettled(selected.map((source) => scrapeWithSteel(source.url)))
  const sources: SourceRecord[] = []

  scrapeResults.forEach((result, index) => {
    const plan = selected[index]
    const role = researchRoles[index] ?? "adversary"
    if (result.status === "fulfilled") {
      const scraped = result.value
      sources.push(
        analyzeSource({
          id: `src-live-${index + 1}`,
          url: plan.url,
          title: scraped.metadata?.title || plan.title,
          markdown: scraped.content?.markdown,
          html: scraped.content?.html ?? scraped.content?.cleanedHtml ?? scraped.content?.cleaned_html,
          statusCode: scraped.metadata?.statusCode ?? scraped.metadata?.status_code,
          redirectedUrl: scraped.metadata?.url ?? scraped.metadata?.canonical,
          role,
          screenshotUrl: scraped.screenshot?.url,
        }),
      )
    } else {
      sources.push({
        id: `src-live-${index + 1}`,
        url: plan.url,
        host: (() => { try { return new URL(plan.url).hostname } catch { return plan.url } })(),
        title: plan.title,
        role,
        status: "review",
        legitimacy: 35,
        summary: "Steel could not complete the page inspection.",
        reason: result.reason instanceof Error ? result.reason.message : "Unknown scrape failure",
        signals: [],
      })
    }
  })

  const allSignals = sources.flatMap((source) => source.signals)
  base.sources = sources
  base.signals = allSignals
  base.actionRisk = actionRisk
  base.quarantinedCount = sources.filter((source) => source.status === "quarantined").length

  let evidence = fallbackEvidence(sources)
  let recommendedAction = base.quarantinedCount
    ? "Pause execution until the trusted sources are independently reconciled."
    : "Stage the best independently verified option for human approval."

  if (aiResearchConfigured()) {
    try {
      const synthesis = await synthesizeEvidence(goal, sources)
      evidence = synthesis.evidence
      recommendedAction = synthesis.recommendedAction
    } catch (error) {
      base.notices?.push(`Semantic evidence synthesis failed safely: ${error instanceof Error ? error.message : "unknown error"}`)
    }
  }

  const { score, factors } = calculateTrustScore(evidence, sources, allSignals, actionRisk)
  base.evidence = evidence
  base.trustScore = score
  base.confidence = score
  base.trustFactors = factors
  base.recommendedAction = recommendedAction
  base.threat = {
    detected: allSignals.some((signal) => signal.severity === "critical" || signal.severity === "high"),
    host: sources.find((source) => source.status === "quarantined")?.host ?? sources[0]?.host ?? "none",
    reason: sources.find((source) => source.status === "quarantined")?.reason ?? "No critical source required quarantine.",
  }
  base.events.push(
    { id: makeId("evt"), at: now(), actor: "signalshield", type: "threat", message: `SignalShield inspected ${sources.length} sources and produced ${allSignals.length} integrity finding${allSignals.length === 1 ? "" : "s"}.` },
    { id: makeId("evt"), at: now(), actor: "verifier", type: "verification", message: `${evidence.filter((item) => item.status === "confirmed").length} evidence items confirmed after cross-source comparison.` },
    { id: makeId("evt"), at: now(), actor: "adversary", type: "threat", message: `${base.quarantinedCount} source${base.quarantinedCount === 1 ? "" : "s"} quarantined from consensus.` },
    { id: makeId("evt"), at: now(), actor: "system", type: "score", message: `Explainable Trust Score resolved to ${score}/100 against a ${base.threshold}/100 review threshold.` },
  )

  base.agents = base.agents.map((agent, index) => {
    if (agent.role === "executor") return agent
    const source = sources[index]
    if (!source) return { ...agent, state: "verified", finding: "Session complete", detail: "No dedicated source assigned" }
    return {
      ...agent,
      state: source.status === "quarantined" ? "quarantined" : "verified",
      source: source.host,
      finding: source.status === "quarantined" ? "Source quarantined" : source.title,
      detail: source.status === "quarantined" ? source.reason ?? "Integrity policy triggered" : source.summary,
    }
  })
  base.status = "awaiting_approval"
  return base
}
