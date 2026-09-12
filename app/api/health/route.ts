import { anthropicConfigured } from "@/lib/anthropic"
import { steelConfigured } from "@/lib/steel"

export async function GET() {
  return Response.json({
    ok: true,
    service: "trustmesh-api",
    steel: steelConfigured() ? "configured" : "demo",
    aiResearch: anthropicConfigured() ? "configured" : "optional",
    execution: "human-gated",
    timestamp: new Date().toISOString(),
  })
}
