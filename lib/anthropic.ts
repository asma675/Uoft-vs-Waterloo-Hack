import Anthropic from "@anthropic-ai/sdk"

let client: Anthropic | null = null

export function anthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}

export function getAnthropicClient(): Anthropic {
  if (!anthropicConfigured()) {
    throw new Error("ANTHROPIC_API_KEY is not configured")
  }
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return client
}

// Budget-driven default — Sonnet 5, not Opus. Override with TRUSTMESH_MODEL.
export function getModel(): string {
  return process.env.TRUSTMESH_MODEL || "claude-sonnet-5"
}

export function getMaxTurns(): number {
  const raw = process.env.TRUSTMESH_MAX_TURNS_PER_AGENT
  const parsed = raw ? Number.parseInt(raw, 10) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 8
}
