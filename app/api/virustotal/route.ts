import { z } from "zod"
import { scanUrlWithVirusTotal } from "@/backend/virustotal"

const ScanRequest = z.object({
  url: z.string().trim().min(1).max(2048),
})

function normalizeHttpUrl(value: string) {
  let candidate = value.trim()

  // Allow users to enter example.com instead of https://example.com
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`
  }

  const parsed = new URL(candidate)

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only HTTP and HTTPS URLs can be scanned.")
  }

  // Remove fragments because they are not sent to the server anyway.
  parsed.hash = ""

  return parsed.toString()
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const parsed = ScanRequest.safeParse(body)

    if (!parsed.success) {
      return Response.json(
        { error: "Provide a valid HTTP or HTTPS URL to scan." },
        { status: 400 }
      )
    }

    let normalizedUrl: string

    try {
      normalizedUrl = normalizeHttpUrl(parsed.data.url)
    } catch {
      return Response.json(
        {
          error:
            "Provide a valid HTTP or HTTPS URL, for example https://example.com",
        },
        { status: 400 }
      )
    }

    const result = await scanUrlWithVirusTotal(normalizedUrl)

    return Response.json(result, {
      headers: {
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    console.error("VirusTotal API route error:", error)

    const message =
      error instanceof Error ? error.message : "VirusTotal scan failed."

    let status = 502

    if (message.includes("not configured")) status = 503
    else if (message.includes("Only HTTP")) status = 400
    else if (message.includes("VirusTotal submission failed (400)")) status = 400
    else if (message.includes("VirusTotal submission failed (401)")) status = 401
    else if (message.includes("VirusTotal submission failed (403)")) status = 403
    else if (message.includes("VirusTotal submission failed (429)")) status = 429

    return Response.json({ error: message }, { status })
  }
}