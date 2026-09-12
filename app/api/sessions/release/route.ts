import { z } from "zod"
import { releaseSteelSession } from "@/lib/steel"

const ReleaseRequest = z.object({ sessionIds: z.array(z.string().min(1).max(200)).max(12).default([]) })

export async function POST(request: Request) {
  const parsed = ReleaseRequest.safeParse(await request.json())
  if (!parsed.success) return Response.json({ error: "Invalid session release request" }, { status: 400 })

  const sessionIds = [...new Set(parsed.data.sessionIds)]
  const results = await Promise.allSettled(sessionIds.map(releaseSteelSession))
  const failed = results.filter((result) => result.status === "rejected").length
  return Response.json({ released: sessionIds.length - failed, failed, requested: sessionIds.length })
}
