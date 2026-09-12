import { z } from "zod"

import { createSteelSession, steelConfigured } from "@/lib/steel"
import { connectBrowserSession } from "@/lib/browser"
import { runExecutor } from "@/lib/agents/executor"
import { clearPendingMission, getPendingMission } from "@/lib/orchestrator"

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

    const { missionId, approvalToken, live, trustScore, threshold } = parsed.data
    if (typeof trustScore === "number" && typeof threshold === "number" && trustScore < threshold) {
      return Response.json(
        { error: `Trust Score ${trustScore}/100 is below the configured review threshold of ${threshold}/100.` },
        { status: 409 },
      )
    }

    const pending = getPendingMission(missionId)
    if (pending && pending.approvalToken !== approvalToken) {
      return Response.json({ error: "Approval token does not match this mission." }, { status: 403 })
    }

    // Not a tracked live mission (demo mode, or the server restarted since
    // the mission ran) — approve without a real Executor action.
    if (!pending || !live || !steelConfigured()) {
      return Response.json({
        missionId,
        status: "approved",
        message: "Human approval recorded. Demo Executor unlocked; no external action was submitted.",
        approvedAt: new Date().toISOString(),
      })
    }

    let executorSession = null
    let message = "Human approval recorded. Demo Executor unlocked; no external action was submitted."

    if (pending.winningUrl) {
      const session = await createSteelSession()
      const browser = await connectBrowserSession(session)
      await runExecutor(pending.winningUrl, browser)
      await browser.close()
      // Left open deliberately — the frontend's own releaseSessions() flow
      // (triggered on reset or the next mission) releases every session on
      // the mission, executor included, by reading agents[].sessionId. That
      // also keeps this session's live-viewer link working immediately
      // after approval instead of killing it the instant we respond.
      executorSession = { id: session.id, debugUrl: session.debugUrl, sessionViewerUrl: session.sessionViewerUrl }
      message = "Human approval recorded. The Executor navigated to the verified listing and stopped — no purchase was submitted."
    }

    clearPendingMission(missionId)

    return Response.json({
      missionId,
      status: "approved",
      executorSession,
      message,
      approvedAt: new Date().toISOString(),
    })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Approval could not be recorded" },
      { status: 500 },
    )
  }
}
