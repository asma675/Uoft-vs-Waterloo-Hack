import { z } from "zod"
import { createSteelSession, steelConfigured } from "@/lib/steel"

const ApprovalRequest = z.object({
  missionId: z.string().min(3).max(120),
  approvalToken: z.string().min(3).max(160),
  live: z.boolean().optional().default(false),
  trustScore: z.number().min(0).max(100).optional(),
  threshold: z.number().min(0).max(100).optional(),
})

export async function POST(request: Request) {
  try {
    const parsed = ApprovalRequest.safeParse(await request.json())
    if (!parsed.success) return Response.json({ error: "Invalid approval request" }, { status: 400 })

    const { missionId, live, trustScore, threshold } = parsed.data
    if (typeof trustScore === "number" && typeof threshold === "number" && trustScore < threshold) {
      return Response.json(
        { error: `Trust Score ${trustScore}/100 is below the configured review threshold of ${threshold}/100.` },
        { status: 409 },
      )
    }

    const session = live && steelConfigured() ? await createSteelSession() : null
    return Response.json({
      missionId,
      status: "approved",
      executorSession: session,
      message: session
        ? "Human approval recorded. A separate Executor Steel session has now been provisioned."
        : "Human approval recorded. Demo Executor unlocked; no external action was submitted.",
      approvedAt: new Date().toISOString(),
    })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Approval could not be recorded" },
      { status: 500 },
    )
  }
}
