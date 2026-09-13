import type { SignalCategory, SignalFinding, SignalSeverity, SourceRecord } from "@/lib/trustmesh"

type ScrapedSource = {
  id: string
  url: string
  title?: string
  markdown?: string
  html?: string
  statusCode?: number
  redirectedUrl?: string
  role: SourceRecord["role"]
  screenshotUrl?: string
  // Days since the domain was registered, from lib/domain-age.ts (RDAP).
  // null/undefined means "unknown" (lookup failed or wasn't attempted) —
  // treated as no signal, never as a negative one.
  domainAgeDays?: number | null
}

const NEW_DOMAIN_THRESHOLD_DAYS = 90

type PatternRule = {
  category: SignalCategory
  severity: SignalSeverity
  impact: number
  label: string
  detail: string
  patterns: RegExp[]
}

const RULES: PatternRule[] = [
  {
    category: "prompt_injection",
    severity: "critical",
    impact: 24,
    label: "Prompt-injection attempt",
    detail: "The page contains language attempting to override or replace the agent's instructions.",
    patterns: [
      /ignore\s+(all\s+)?(previous|prior|earlier)\s+(instructions?|prompts?)/i,
      /disregard\s+(the\s+)?(user|system|previous)\s+(instructions?|message)/i,
      /override\s+(the\s+)?(system|developer|user)\s+(prompt|instructions?)/i,
      /new\s+system\s+(message|instruction)/i,
    ],
  },
  {
    category: "ai_directed_instruction",
    severity: "high",
    impact: 16,
    label: "AI-directed instruction",
    detail: "The content addresses an AI/agent directly and attempts to steer its behavior.",
    patterns: [
      /(?:ai|browser|shopping|autonomous)\s+agent\s*[:,-]/i,
      /(?:important\s+)?(?:ai|browser|shopping|autonomous)\s+agent\s+instruction/i,
      /if\s+you\s+are\s+(?:an?\s+)?(?:ai|llm|agent|chatbot)/i,
      /you\s+are\s+(?:chatgpt|claude|gemini|an?\s+ai\s+agent)/i,
      /do\s+not\s+(?:tell|show|reveal|report)\s+(?:this\s+(?:note|information)\s+)?(?:to\s+)?(?:the\s+)?user/i,
    ],
  },
  {
    category: "sponsored",
    severity: "medium",
    impact: 4,
    label: "Sponsored content",
    detail: "Commercial sponsorship is disclosed or strongly indicated and should be independently verified.",
    patterns: [/\bsponsored\b/i, /paid\s+(?:placement|partnership|promotion)/i, /presented\s+by/i],
  },
  {
    category: "affiliate",
    severity: "medium",
    impact: 5,
    label: "Affiliate influence",
    detail: "Affiliate or referral language/links may create a financial incentive behind the recommendation.",
    patterns: [/affiliate\s+(?:link|commission|disclosure)/i, /we\s+may\s+earn\s+(?:a\s+)?commission/i, /referral\s+(?:link|fee|code)/i],
  },
  {
    // Merged from separate "advertising" and "promotional" categories — both
    // were low-severity and never quarantined anything on their own; kept
    // apart they just added pill clutter on ordinary retail pages that
    // legitimately use marketing language. One combined signal instead.
    category: "commercial_language",
    severity: "low",
    impact: 2,
    label: "Commercial marketing language",
    detail: "Advertising or promotional language is present (ads, superlatives, urgency framing). It is treated as commercially influenced evidence, not automatically as false.",
    patterns: [/\badvertisement\b/i, /\badvertorial\b/i, /\bpromoted\b/i, /\bbest\s+deal\s+ever\b/i, /\bmust[- ]?buy\b/i, /\bonly\s+\d+\s+left\b/i, /\bact\s+now\b/i, /\blimited[- ]time\s+offer\b/i],
  },
  {
    category: "deceptive_content",
    severity: "high",
    impact: 14,
    label: "Deceptive or coercive wording",
    detail: "The content uses coercion, false certainty, or conceals material conditions in ways that require quarantine review.",
    patterns: [/guaranteed\s+lowest\s+price/i, /no\s+need\s+to\s+verify/i, /trust\s+this\s+page\s+only/i, /skip\s+(?:all\s+)?other\s+(?:sources|results)/i],
  },
]

// Finds sentence-length chunks of text that repeat verbatim (normalized)
// three or more times on the same page. This is not "AI-generated content
// detection" — there is no reliable way to tell that a sentence was written
// by an LLM. It's the same signal review-fraud systems have used for years:
// independent human reviewers don't write byte-identical sentences, so a
// sentence repeated across a page's "reviews" is a specific, checkable sign
// of templated/mass-produced marketing rather than genuine customer voices.
function findDuplicateSegments(text: string, minCount = 3): Array<{ normalized: string; original: string; count: number }> {
  const segments = text.split(/(?<=[.!?])\s+|\n+/)
  const counts = new Map<string, { count: number; original: string }>()

  for (const raw of segments) {
    const trimmed = raw.trim()
    if (trimmed.length < 25 || trimmed.length > 200) continue
    const normalized = trimmed.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim()
    if (normalized.length < 20) continue
    const existing = counts.get(normalized)
    if (existing) existing.count += 1
    else counts.set(normalized, { count: 1, original: trimmed })
  }

  return [...counts.entries()]
    .map(([normalized, value]) => ({ normalized, ...value }))
    .filter((entry) => entry.count >= minCount)
    .sort((a, b) => b.count - a.count)
}

// Collapses repeats of a detected duplicate sentence down to its first two
// occurrences (so genuine incidental repetition — the same spec mentioned
// near the price and again near the reviews — isn't destroyed), replacing
// the third and later copies with a single marker. Used to keep templated
// review-farm text from padding out (and biasing) what an agent reads.
function collapseManufacturedReviews(text: string): { text: string; redactions: NoiseRedaction[] } {
  const duplicates = findDuplicateSegments(text)
  if (!duplicates.length) return { text, redactions: [] }

  const duplicateKeys = new Set(duplicates.map((entry) => entry.normalized))
  const seenCounts = new Map<string, number>()
  const redactions: NoiseRedaction[] = []
  const kept: string[] = []

  for (const raw of text.split(/(?<=[.!?])\s+|\n+/)) {
    const trimmed = raw.trim()
    const normalized = trimmed.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim()
    if (!duplicateKeys.has(normalized)) {
      kept.push(raw)
      continue
    }
    const count = (seenCounts.get(normalized) ?? 0) + 1
    seenCounts.set(normalized, count)
    if (count <= 2) {
      kept.push(raw)
      continue
    }
    redactions.push({ category: "manufactured_reviews", label: "Manufactured review pattern", snippet: trimmed.slice(0, 120) })
    if (count === 3) kept.push("[SignalShield collapsed repeated templated review text]")
  }

  return { text: kept.join(" "), redactions }
}

const firstMatch = (text: string, patterns: RegExp[]) => {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[0]) return match[0].slice(0, 180)
  }
  return undefined
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

const hasAffiliateUrl = (url: string) => /(?:[?&](?:aff|affid|affiliate|ref|referral|partner|tag)=)|(?:utm_(?:source|campaign)=affiliate)/i.test(url)

const hiddenTextEvidence = (html: string) => {
  const patterns = [
    /style=["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:[;"']|\b)|font-size\s*:\s*0|left\s*:\s*-\d{3,}px)[^"']*["'][^>]*>([^<]{8,220})/i,
    /aria-hidden=["']true["'][^>]*>([^<]{8,220})/i,
  ]
  return firstMatch(html, patterns)
}

const suspiciousRedirect = (original: string, redirected?: string) => {
  if (!redirected) return false
  try {
    const a = new URL(original)
    const b = new URL(redirected)
    return a.hostname !== b.hostname
  } catch {
    return false
  }
}

export interface NoiseRedaction {
  category: SignalCategory
  label: string
  snippet: string
}

// Categories stripped from page text before a browsing agent ever reads it —
// the prevention half of SignalShield. analyzeSource() below is the
// detection/quarantine half, which still runs afterward on the *original*
// page for the Evidence/Security views; this function only protects the
// agent's own reasoning from ads, sponsorship, and AI-directed manipulation.
const NOISE_CATEGORIES = new Set<SignalCategory>(["prompt_injection", "ai_directed_instruction", "deceptive_content", "sponsored", "affiliate", "commercial_language"])

export function redactInfluenceNoise(text: string): { text: string; redactions: NoiseRedaction[] } {
  const redactions: NoiseRedaction[] = []
  let output = text

  for (const rule of RULES) {
    if (!NOISE_CATEGORIES.has(rule.category)) continue
    for (const pattern of rule.patterns) {
      const global = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`)
      output = output.replace(global, (match) => {
        redactions.push({ category: rule.category, label: rule.label, snippet: match.slice(0, 120) })
        return `[SignalShield removed ${rule.label.toLowerCase()}]`
      })
    }
  }

  const deduped = collapseManufacturedReviews(output)
  output = deduped.text
  redactions.push(...deduped.redactions)

  return { text: output, redactions }
}

export function analyzeSource(input: ScrapedSource): SourceRecord {
  const markdown = input.markdown ?? ""
  const html = input.html ?? ""
  const combined = `${markdown}\n${html}`.slice(0, 240_000)
  const findings: SignalFinding[] = []

  for (const rule of RULES) {
    const evidence = firstMatch(combined, rule.patterns)
    if (!evidence) continue
    findings.push({
      id: `${input.id}-${rule.category}`,
      category: rule.category,
      severity: rule.severity,
      sourceId: input.id,
      label: rule.label,
      detail: rule.detail,
      evidence,
      impact: rule.impact,
    })
  }

  if (hasAffiliateUrl(input.url)) {
    findings.push({
      id: `${input.id}-affiliate-url`,
      category: "affiliate",
      severity: "medium",
      sourceId: input.id,
      label: "Referral parameter",
      detail: "The source URL contains an affiliate/referral parameter and is down-weighted until independently verified.",
      evidence: input.url.slice(0, 180),
      impact: 4,
    })
  }

  if (typeof input.domainAgeDays === "number" && input.domainAgeDays < NEW_DOMAIN_THRESHOLD_DAYS) {
    findings.push({
      id: `${input.id}-new-domain`,
      category: "new_domain",
      severity: "high",
      sourceId: input.id,
      label: "Newly registered domain",
      detail: `This domain was registered ${input.domainAgeDays} day${input.domainAgeDays === 1 ? "" : "s"} ago. A brand-new domain selling an in-demand product is one of the strongest real-world scam indicators.`,
      evidence: `Domain age: ${input.domainAgeDays} day${input.domainAgeDays === 1 ? "" : "s"}`,
      impact: 18,
    })
  }

  const duplicateReviews = findDuplicateSegments(markdown || combined)
  if (duplicateReviews.length) {
    const worst = duplicateReviews[0]
    findings.push({
      id: `${input.id}-manufactured-reviews`,
      category: "manufactured_reviews",
      severity: "medium",
      sourceId: input.id,
      label: "Manufactured review pattern",
      detail: `The same sentence appears ${worst.count} times on this page — a hallmark of templated/mass-produced marketing content rather than independent customer reviews.`,
      evidence: worst.original.slice(0, 180),
      impact: 10,
    })
  }

  const hiddenEvidence = hiddenTextEvidence(html)
  if (hiddenEvidence) {
    findings.push({
      id: `${input.id}-hidden-text`,
      category: "hidden_text",
      severity: "high",
      sourceId: input.id,
      label: "Hidden or off-screen text",
      detail: "SignalShield detected content hidden from normal visual presentation that could influence an automated reader.",
      evidence: hiddenEvidence.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 180),
      impact: 12,
    })
  }

  if (suspiciousRedirect(input.url, input.redirectedUrl)) {
    findings.push({
      id: `${input.id}-redirect`,
      category: "suspicious_redirect",
      severity: "medium",
      sourceId: input.id,
      label: "Cross-domain redirect",
      detail: "The requested URL resolved to a different host and requires additional verification.",
      evidence: `${input.url} → ${input.redirectedUrl}`.slice(0, 180),
      impact: 7,
    })
  }

  const statusPenalty = input.statusCode && input.statusCode >= 400 ? 25 : 0
  const severe = findings.filter((finding) => finding.severity === "critical" || finding.severity === "high")
  const medium = findings.filter((finding) => finding.severity === "medium")
  const signalPenalty = findings.reduce((sum, finding) => sum + finding.impact, 0)
  const legitimacy = Math.max(10, Math.min(99, 92 - statusPenalty - signalPenalty))
  const status: SourceRecord["status"] = severe.length ? "quarantined" : medium.length >= 2 || legitimacy < 68 ? "review" : "trusted"

  const excerpt = markdown.replace(/[#>*_`~\[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 230)
  return {
    id: input.id,
    url: input.url,
    host: hostOf(input.redirectedUrl ?? input.url),
    title: input.title?.trim() || hostOf(input.url),
    role: input.role,
    status,
    legitimacy,
    summary: excerpt || `Steel returned ${input.statusCode ?? "an unknown"} status with no readable summary.`,
    reason: status === "quarantined" ? severe.map((finding) => finding.label).join(" + ") : undefined,
    screenshotUrl: input.screenshotUrl,
    signals: findings,
  }
}
