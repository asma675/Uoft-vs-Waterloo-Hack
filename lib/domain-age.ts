// Best-effort domain-registration-age lookup via RDAP (RFC 7480-7484), the
// standardized JSON successor to WHOIS. Uses IANA's own published bootstrap
// registry (data.iana.org/rdap/dns.json) to find the right RDAP server for a
// domain's TLD, rather than depending on a single third-party WHOIS proxy.
//
// This is the one SignalShield check that needs live network access instead
// of plain text/regex — and it's optional evidence, not a verdict. Any
// failure (unsupported TLD, registry timeout, a privacy-redacted
// registration date) falls back to null ("unknown"), which contributes no
// signal rather than a false one. A brand-new domain is suspicious; we can't
// confirm an old one is legitimate just because the lookup failed.

const BOOTSTRAP_URL = "https://data.iana.org/rdap/dns.json"
const LOOKUP_TIMEOUT_MS = 4000

interface BootstrapRegistry {
  services: Array<[string[], string[]]>
}

interface RdapEvent {
  eventAction?: string
  eventDate?: string
}

interface RdapDomainResponse {
  events?: RdapEvent[]
}

let bootstrapCache: Promise<BootstrapRegistry | null> | null = null

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

function getBootstrap(): Promise<BootstrapRegistry | null> {
  if (!bootstrapCache) {
    bootstrapCache = fetchWithTimeout(BOOTSTRAP_URL, LOOKUP_TIMEOUT_MS)
      .then((response) => (response.ok ? (response.json() as Promise<BootstrapRegistry>) : null))
      .catch(() => null)
  }
  return bootstrapCache
}

function tldOf(host: string): string {
  const parts = host.toLowerCase().split(".")
  return parts[parts.length - 1] ?? ""
}

async function rdapServerFor(host: string): Promise<string | null> {
  const registry = await getBootstrap()
  if (!registry) return null
  const tld = tldOf(host)
  const entry = registry.services.find(([tlds]) => tlds.includes(tld))
  const server = entry?.[1]?.[0]
  return server ? server.replace(/\/$/, "") : null
}

// Returns how many days ago the domain was registered, or null if that
// couldn't be determined (unsupported TLD, lookup failure, or the registry
// didn't publish a registration event).
export async function getDomainAgeDays(host: string): Promise<number | null> {
  try {
    const server = await rdapServerFor(host)
    if (!server) return null

    const response = await fetchWithTimeout(`${server}/domain/${host}`, LOOKUP_TIMEOUT_MS)
    if (!response.ok) return null

    const body = (await response.json()) as RdapDomainResponse
    const registration = body.events?.find((event) => event.eventAction === "registration")
    if (!registration?.eventDate) return null

    const registeredAt = new Date(registration.eventDate).getTime()
    if (Number.isNaN(registeredAt)) return null

    return Math.max(0, Math.round((Date.now() - registeredAt) / (1000 * 60 * 60 * 24)))
  } catch {
    return null
  }
}
