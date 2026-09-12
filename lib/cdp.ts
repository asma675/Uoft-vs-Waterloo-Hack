// Minimal Chrome DevTools Protocol client over a raw WebSocket. No Playwright
// — this app deploys to Cloudflare Workers, where Playwright's driver
// resolution and I/O assumptions don't hold reliably even for CDP-only use
// against a remote browser. Uses only the global `WebSocket` (available
// under both `nodejs_compat` Workers and Node 22+), no native dependencies.

interface CdpRequest {
  id: number
  method: string
  params?: Record<string, unknown>
  sessionId?: string
}

interface CdpResponse {
  id?: number
  method?: string
  params?: unknown
  result?: unknown
  error?: { code: number; message: string }
  sessionId?: string
}

type EventHandler = (params: unknown, sessionId?: string) => void

export class CdpClient {
  private ws: WebSocket
  private nextId = 1
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
  private eventHandlers = new Map<string, Set<EventHandler>>()
  private ready: Promise<void>

  constructor(url: string) {
    this.ws = new WebSocket(url)
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener("open", () => resolve(), { once: true })
      this.ws.addEventListener("error", () => reject(new Error("CDP WebSocket connection failed")), { once: true })
    })
    this.ws.addEventListener("message", (event) => this.handleMessage(event))
  }

  private handleMessage(event: MessageEvent): void {
    let message: CdpResponse
    try {
      message = JSON.parse(typeof event.data === "string" ? event.data : "")
    } catch {
      return
    }

    if (message.id != null) {
      const pending = this.pending.get(message.id)
      if (!pending) return
      this.pending.delete(message.id)
      if (message.error) {
        pending.reject(new Error(`CDP error ${message.error.code}: ${message.error.message}`))
      } else {
        pending.resolve(message.result)
      }
      return
    }

    if (message.method) {
      const handlers = this.eventHandlers.get(message.method)
      if (handlers) {
        for (const handler of handlers) handler(message.params, message.sessionId)
      }
    }
  }

  async send<T = unknown>(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<T> {
    await this.ready
    const id = this.nextId++
    const request: CdpRequest = { id, method, params }
    if (sessionId) request.sessionId = sessionId

    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject })
      this.ws.send(JSON.stringify(request))
    })
  }

  on(method: string, handler: EventHandler): () => void {
    let handlers = this.eventHandlers.get(method)
    if (!handlers) {
      handlers = new Set()
      this.eventHandlers.set(method, handlers)
    }
    handlers.add(handler)
    return () => handlers!.delete(handler)
  }

  // Resolves with the event's params once `predicate` matches (or the first
  // occurrence if no predicate is given). Never rejects — instead resolves
  // with `null` on timeout, so callers can treat "the page didn't settle in
  // time" as a bounded, non-fatal outcome rather than an error.
  once(method: string, predicate?: (params: unknown, sessionId?: string) => boolean, timeoutMs = 5000): Promise<unknown> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        off()
        resolve(null)
      }, timeoutMs)

      const off = this.on(method, (params, sessionId) => {
        if (predicate && !predicate(params, sessionId)) return
        clearTimeout(timer)
        off()
        resolve(params)
      })
    })
  }

  close(): void {
    this.ws.close()
  }
}
