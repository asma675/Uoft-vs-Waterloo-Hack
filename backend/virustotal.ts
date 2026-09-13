const VT_BASE_URL = "https://www.virustotal.com/api/v3"
export function virusTotalConfigured() {
  return Boolean(process.env.VIRUSTOTAL_API_KEY?.trim())
}

type VirusTotalStats = {
  harmless?: number
  malicious?: number
  suspicious?: number
  undetected?: number
  timeout?: number
}

type VirusTotalAnalysisResponse = {
  data?: {
    id?: string
    attributes?: {
      status?: string
      stats?: VirusTotalStats
    }
  }
}

function getVirusTotalKey() {
  const key = process.env.VIRUSTOTAL_API_KEY?.trim()

  if (!key) {
    throw new Error(
      "VirusTotal is not configured. Add VIRUSTOTAL_API_KEY to .env.local and restart the server."
    )
  }

  return key
}

function makeUrlId(url: string) {
  return Buffer.from(url)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
}

export async function scanUrlWithVirusTotal(url: string) {
  const apiKey = getVirusTotalKey()

  const parsedUrl = new URL(url)

  if (
    parsedUrl.protocol !== "http:" &&
    parsedUrl.protocol !== "https:"
  ) {
    throw new Error("Only HTTP and HTTPS URLs can be scanned.")
  }

  const normalizedUrl = parsedUrl.toString()

  /*
   * IMPORTANT:
   * VirusTotal expects:
   *
   * Content-Type: application/x-www-form-urlencoded
   * url=https://example.com
   *
   * Do NOT send JSON here.
   */
  const body = new URLSearchParams()
  body.set("url", normalizedUrl)

  const submissionResponse = await fetch(`${VT_BASE_URL}/urls`, {
    method: "POST",
    headers: {
      "x-apikey": apiKey,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
    cache: "no-store",
  })

  const submissionText = await submissionResponse.text()

  if (!submissionResponse.ok) {
    throw new Error(
      `VirusTotal submission failed (${submissionResponse.status}): ${submissionText}`
    )
  }

  let submission: VirusTotalAnalysisResponse

  try {
    submission = JSON.parse(submissionText)
  } catch {
    throw new Error("VirusTotal returned an invalid submission response.")
  }

  const analysisId = submission.data?.id

  if (!analysisId) {
    throw new Error("VirusTotal did not return an analysis ID.")
  }

  // Give VirusTotal a moment to process the URL.
  let analysis: VirusTotalAnalysisResponse | null = null

  for (let attempt = 0; attempt < 8; attempt++) {
    const analysisResponse = await fetch(
      `${VT_BASE_URL}/analyses/${encodeURIComponent(analysisId)}`,
      {
        headers: {
          "x-apikey": apiKey,
          Accept: "application/json",
        },
        cache: "no-store",
      }
    )

    if (!analysisResponse.ok) {
      const errorText = await analysisResponse.text()

      throw new Error(
        `VirusTotal analysis failed (${analysisResponse.status}): ${errorText}`
      )
    }

    analysis = (await analysisResponse.json()) as VirusTotalAnalysisResponse

    if (analysis.data?.attributes?.status === "completed") {
      break
    }

    await new Promise((resolve) => setTimeout(resolve, 1200))
  }

  const stats = analysis?.data?.attributes?.stats ?? {}
  const status = analysis?.data?.attributes?.status ?? "queued"

  const malicious = stats.malicious ?? 0
  const suspicious = stats.suspicious ?? 0

  let verdict: "clean" | "suspicious" | "malicious" | "pending"

  if (status !== "completed") {
    verdict = "pending"
  } else if (malicious > 0) {
    verdict = "malicious"
  } else if (suspicious > 0) {
    verdict = "suspicious"
  } else {
    verdict = "clean"
  }

  const urlId = makeUrlId(normalizedUrl)

  return {
    url: normalizedUrl,
    status,
    verdict,
    stats: {
      harmless: stats.harmless ?? 0,
      malicious,
      suspicious,
      undetected: stats.undetected ?? 0,
      timeout: stats.timeout ?? 0,
    },
    analysisId,
    permalink: `https://www.virustotal.com/gui/url/${urlId}`,
  }
}