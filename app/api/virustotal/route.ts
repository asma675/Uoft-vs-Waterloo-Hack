import { z } from "zod"
import { scanUrlWithVirusTotal } from "@/backend/virustotal"

const ScanRequest = z.object({
  url: z.string().trim().url().max(2048),
})

export async function POST(request: Request) {
  try {
    const parsed = ScanRequest.safeParse(await request.json())
    if (!parsed.success) return Response.json({ error: "Provide a valid HTTP or HTTPS URL to scan." }, { status: 400 })
    const result = await scanUrlWithVirusTotal(parsed.data.url)
    return Response.json(result, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    const message = error instanceof Error ? error.message : "VirusTotal scan failed."
    const status = message.includes("not configured") ? 503 : message.includes("Only HTTP") ? 400 : 502
    return Response.json({ error: message }, { status })
  }
}
