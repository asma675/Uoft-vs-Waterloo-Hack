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
}

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
      /if\s+you\s+are\s+(?:an?\s+)?(?:ai|llm|agent|chatbot)/i,
      /you\s+are\s+(?:chatgpt|claude|gemini|an?\s+ai\s+agent)/i,
      /do\s+not\s+(?:tell|show|reveal)\s+(?:the\s+)?user/i,
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
    category: "advertising",
    severity: "low",
    impact: 2,
    label: "Advertising content",
    detail: "Advertising language is present. It is treated as commercially influenced evidence, not automatically as false.",
    patterns: [/\badvertisement\b/i, /\badvertorial\b/i, /\bpromoted\b/i],
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
    category: "promotional",
    severity: "low",
    impact: 2,
    label: "Highly promotional copy",
    detail: "Urgent or superlative marketing language may bias an agent and should be down-weighted.",
    patterns: [/\bbest\s+deal\s+ever\b/i, /\bmust[- ]?buy\b/i, /\bonly\s+\d+\s+left\b/i, /\bact\s+now\b/i, /\blimited[- ]time\s+offer\b/i],
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
