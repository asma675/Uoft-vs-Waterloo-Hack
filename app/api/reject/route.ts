import { z } from "zod"

import { clearPendingMission, getPendingMission } from "@/lib/orchestrator"

const RejectRequest = z.object({
  missionId: z.string().min(3).max(120),
  approvalToken: z.string().min(3).max(160),
  reason: z.string().trim().max(500).optional(),
})

export async function POST(request: Request) {
  const parsed = RejectRequest.safeParse(await request.json())
  if (!parsed.success) return Response.json({ error: "Invalid rejection request" }, { status: 400 })

  const { missionId, approvalToken } = parsed.data
  const pending = getPendingMission(missionId)
  if (pending && pending.approvalToken !== approvalToken) {
    return Response.json({ error: "Approval token does not match this mission." }, { status: 403 })
  }

  clearPendingMission(missionId)

  return Response.json({
    missionId,
    status: "rejected",
    message: "Human rejection recorded. Executor remains locked and no external action was performed.",
    rejectedAt: new Date().toISOString(),
  })
}
