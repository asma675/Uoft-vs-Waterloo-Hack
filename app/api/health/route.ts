import { aiResearchConfigured } from "@/backend/openai-research"
import { steelConfigured } from "@/backend/steel"
import { virusTotalConfigured } from "@/backend/virustotal"

export async function GET() {
  return Response.json({
    ok: true,
    service: "trustmesh-api",
    steel: steelConfigured() ? "configured" : "demo",
    aiResearch: aiResearchConfigured() ? "configured" : "optional",
    virusTotal: virusTotalConfigured() ? "configured" : "optional",
    execution: "human-gated",
    timestamp: new Date().toISOString(),
  }, { headers: { "Cache-Control": "no-store" } })
}
