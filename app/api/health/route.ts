import { aiResearchConfigured } from "@/lib/openai-research"
import { steelConfigured } from "@/lib/steel"

export async function GET() {
  return Response.json({
    ok: true,
    service: "trustmesh-api",
    steel: steelConfigured() ? "configured" : "demo",
    aiResearch: aiResearchConfigured() ? "configured" : "optional",
    virusTotal: process.env.VIRUSTOTAL_API_KEY ? "configured" : "optional",
    execution: "human-gated",
    timestamp: new Date().toISOString(),
  })
}
