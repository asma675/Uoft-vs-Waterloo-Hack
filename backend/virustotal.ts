const VIRUSTOTAL_API = "https://www.virustotal.com/api/v3"

type VirusTotalAnalysis = {
  data?: {
    id?: string
    attributes?: {
      status?: string
      stats?: Record<string, number>
    }
  }
}

export type VirusTotalScanResult = {
  url: string
  status: string
  stats: Record<string, number>
  permalink: string
  analysisId: string
}

export function virusTotalConfigured() {
  return Boolean(process.env.VIRUSTOTAL_API_KEY)
}

export async function scanUrlWithVirusTotal(url: string): Promise<VirusTotalScanResult> {
  const apiKey = process.env.VIRUSTOTAL_API_KEY
  if (!apiKey) throw new Error("VirusTotal is not configured. Add VIRUSTOTAL_API_KEY to .env.local and restart the server.")

  const target = new URL(url)
  if (!["http:", "https:"].includes(target.protocol)) throw new Error("Only HTTP and HTTPS URLs can be scanned.")

  const headers = { "x-apikey": apiKey, accept: "application/json" }
  const form = new URLSearchParams({ url: target.toString() })
  const submission = await fetch(`${VIRUSTOTAL_API}/urls`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/x-www-form-urlencoded" },
    body: form,
    signal: AbortSignal.timeout(20_000),
  })
  if (!submission.ok) {
    const detail = await submission.text().catch(() => "")
    throw new Error(`VirusTotal submission failed (${submission.status})${detail ? `: ${detail.slice(0, 180)}` : ""}`)
  }

  const submitted = await submission.json() as VirusTotalAnalysis
  const analysisId = submitted.data?.id
  if (!analysisId) throw new Error("VirusTotal returned no analysis identifier.")

  let analysis: VirusTotalAnalysis = submitted
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetch(`${VIRUSTOTAL_API}/analyses/${encodeURIComponent(analysisId)}`, {
      headers,
      signal: AbortSignal.timeout(20_000),
    })
    if (!response.ok) throw new Error(`VirusTotal analysis lookup failed (${response.status}).`)
    analysis = await response.json() as VirusTotalAnalysis
    if (analysis.data?.attributes?.status === "completed") break
    if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 1200))
  }

  const urlId = Buffer.from(target.toString()).toString("base64url")
  return {
    url: target.toString(),
    status: analysis.data?.attributes?.status ?? "queued",
    stats: analysis.data?.attributes?.stats ?? {},
    permalink: `https://www.virustotal.com/gui/url/${urlId}/detection`,
    analysisId,
  }
}
