import { z } from "zod"

const ScanRequest = z.object({
  url: z.string().trim().url().max(2048),
})

type VirusTotalAnalysis = {
  data?: {
    id?: string
    type?: string
    attributes?: {
      status?: string
      stats?: Record<string, number>
    }
    links?: { self?: string }
  }
}

const VIRUSTOTAL_API = "https://www.virustotal.com/api/v3"

export async function POST(request: Request) {
  const apiKey = process.env.VIRUSTOTAL_API_KEY
  if (!apiKey) {
    return Response.json({ error: "VirusTotal is not configured. Add VIRUSTOTAL_API_KEY to .env." }, { status: 503 })
  }

  const parsed = ScanRequest.safeParse(await request.json())
  if (!parsed.success) {
    return Response.json({ error: "Provide a valid URL to scan." }, { status: 400 })
  }

  let target: URL
  try {
    target = new URL(parsed.data.url)
  } catch {
    return Response.json({ error: "Only valid URLs can be scanned." }, { status: 400 })
  }
  if (!["http:", "https:"].includes(target.protocol)) {
    return Response.json({ error: "Only HTTP and HTTPS URLs can be scanned." }, { status: 400 })
  }

  const headers = { "x-apikey": apiKey, accept: "application/json" }
  const form = new URLSearchParams({ url: target.toString() })
  const submission = await fetch(`${VIRUSTOTAL_API}/urls`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/x-www-form-urlencoded" },
    body: form,
    signal: AbortSignal.timeout(20_000),
  })
  if (!submission.ok) {
    return Response.json({ error: `VirusTotal submission failed (${submission.status}).` }, { status: 502 })
  }

  const submitted = await submission.json() as VirusTotalAnalysis
  const analysisId = submitted.data?.id
  if (!analysisId) {
    return Response.json({ error: "VirusTotal returned no analysis identifier." }, { status: 502 })
  }

  let analysis: VirusTotalAnalysis = submitted
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${VIRUSTOTAL_API}/analyses/${encodeURIComponent(analysisId)}`, {
      headers,
      signal: AbortSignal.timeout(20_000),
    })
    if (!response.ok) {
      return Response.json({ error: `VirusTotal analysis lookup failed (${response.status}).` }, { status: 502 })
    }
    analysis = await response.json() as VirusTotalAnalysis
    if (analysis.data?.attributes?.status === "completed") break
    await new Promise((resolve) => setTimeout(resolve, 1500))
  }

  const stats = analysis.data?.attributes?.stats ?? {}
  const permalink = `https://www.virustotal.com/gui/url/${Buffer.from(target.toString()).toString("base64url")}/detection`
  return Response.json({
    url: target.toString(),
    status: analysis.data?.attributes?.status ?? "queued",
    stats,
    permalink,
    analysisId,
  }, { headers: { "Cache-Control": "no-store" } })
}
