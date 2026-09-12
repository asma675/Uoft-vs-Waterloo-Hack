export type SteelSession = {
  id: string
  debugUrl?: string
  sessionViewerUrl?: string
  websocketUrl?: string
}

const STEEL_API = process.env.STEEL_API_URL?.replace(/\/$/, "") || "https://api.steel.dev/v1"

function apiKey() {
  return process.env.STEEL_API_KEY
}

export function steelConfigured() {
  return Boolean(apiKey())
}

async function steelFetch(path: string, init: RequestInit) {
  const key = apiKey()
  if (!key) throw new Error("STEEL_API_KEY is not configured")
  const response = await fetch(`${STEEL_API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "steel-api-key": key,
      ...(init.headers ?? {}),
    },
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => "")
    throw new Error(`Steel API failed (${response.status})${detail ? `: ${detail.slice(0, 240)}` : ""}`)
  }
  return response
}

export async function createSteelSession(): Promise<SteelSession> {
  const timeout = Number(process.env.STEEL_SESSION_TIMEOUT_MS || 600_000)
  const inactivityTimeout = Number(process.env.STEEL_INACTIVITY_TIMEOUT_MS || 180_000)
  const response = await steelFetch("/sessions", {
    method: "POST",
    body: JSON.stringify({
      timeout: Number.isFinite(timeout) ? timeout : 600_000,
      inactivityTimeout: Number.isFinite(inactivityTimeout) ? inactivityTimeout : 180_000,
    }),
  })
  return (await response.json()) as SteelSession
}

export async function releaseSteelSession(sessionId: string) {
  if (!apiKey() || !sessionId) return
  await steelFetch(`/sessions/${encodeURIComponent(sessionId)}/release`, { method: "POST" })
}
