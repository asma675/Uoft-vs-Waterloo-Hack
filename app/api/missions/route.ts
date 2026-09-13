import { z } from "zod"
import { runMission } from "@/backend/orchestrator"

const MissionRequest = z.object({
  goal: z.string().trim().min(8).max(4000),
  live: z.boolean().optional().default(false),
})

export async function POST(request: Request) {
  try {
    const parsed = MissionRequest.safeParse(await request.json())
    if (!parsed.success) {
      return Response.json({ error: "Provide a mission goal between 8 and 4,000 characters." }, { status: 400 })
    }
    const mission = await runMission(parsed.data.goal, parsed.data.live)
    return Response.json(mission, { status: 201, headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Mission could not be started" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    )
  }
}
