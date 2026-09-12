// Real CDP-backed implementation of the BrowserSession interface, driving a
// live Steel.dev session directly over the Chrome DevTools Protocol — no
// Playwright. This is the module lib/browser.ts should re-export from once
// it's been verified against a real Steel session (see the debug route
// mentioned in the project's handoff notes for how to check that).
//
// Field shapes for Accessibility.getFullAXTree and DOM.getBoxModel below are
// written from the documented CDP protocol (these domains have been stable
// for years), but have NOT been exercised against Steel's actual Chromium
// build yet — Steel's build isn't pinned anywhere in this repo, and CDP
// shapes can vary by version. Confirm against a live session before trusting
// this in a judged/demo run.

import { CdpClient } from "@/lib/cdp"

export interface ElementInfo {
  index: number
  role: string
  name: string
}

export interface PageSnapshot {
  url: string
  title: string
  text: string
  elements: ElementInfo[]
}

export interface BrowserSession {
  navigate(url: string): Promise<PageSnapshot>
  readPage(): Promise<PageSnapshot>
  click(elementIndex: number): Promise<PageSnapshot>
  goBack(): Promise<PageSnapshot>
  close(): Promise<void>
}

export interface SteelSessionLike {
  id: string
  debugUrl?: string
  sessionViewerUrl?: string
  websocketUrl?: string
}

const MAX_TEXT_CHARS = 4000
const NAVIGATION_TIMEOUT_MS = 10000
const SETTLE_TIMEOUT_MS = 3000

// Roles kept as clickable elements vs. as page text. CDP accessible-role
// strings aren't consistently cased across Chrome versions, so matching is
// done in lowercase.
const INTERACTIVE_ROLES = new Set(["button", "link", "textbox", "checkbox", "radio", "combobox", "menuitem", "tab", "switch", "searchbox", "option"])
const TEXT_ROLES = new Set(["statictext", "heading", "paragraph", "text"])

interface AXValue {
  value?: unknown
}

interface AXNode {
  nodeId: string
  ignored?: boolean
  role?: AXValue
  name?: AXValue
  backendDOMNodeId?: number
}

function parseAxTree(nodes: AXNode[]): { text: string; elements: ElementInfo[]; elementBackendIds: number[] } {
  const textParts: string[] = []
  const elements: ElementInfo[] = []
  const elementBackendIds: number[] = []

  for (const node of nodes) {
    if (node.ignored) continue
    const role = typeof node.role?.value === "string" ? node.role.value.toLowerCase() : ""
    const name = typeof node.name?.value === "string" ? node.name.value.trim() : ""
    if (!role) continue

    if (INTERACTIVE_ROLES.has(role) && node.backendDOMNodeId != null) {
      elements.push({ index: elements.length, role, name })
      elementBackendIds.push(node.backendDOMNodeId)
      continue
    }

    if (TEXT_ROLES.has(role) && name) {
      textParts.push(name)
    }
  }

  const text = textParts.join(" ").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_CHARS)
  return { text, elements, elementBackendIds }
}

async function attachToSteelSession(client: CdpClient): Promise<string> {
  const attachedPromise = client.once(
    "Target.attachedToTarget",
    (params) => (params as { targetInfo?: { type?: string } } | null)?.targetInfo?.type === "page",
    3000,
  )

  await client.send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: true })

  const attached = (await attachedPromise) as { sessionId?: string } | null
  if (attached?.sessionId) {
    return attached.sessionId
  }

  // Fallback: Steel's page was already open before we attached, and no
  // Target.attachedToTarget event arrived — enumerate targets directly.
  const { targetInfos } = await client.send<{ targetInfos: Array<{ targetId: string; type: string }> }>("Target.getTargets")
  const page = targetInfos.find((target) => target.type === "page")
  if (!page) {
    throw new Error("No page target found on this Steel session")
  }
  const { sessionId } = await client.send<{ sessionId: string }>("Target.attachToTarget", { targetId: page.targetId, flatten: true })
  return sessionId
}

class CdpBrowserSession implements BrowserSession {
  private lastElementBackendIds: number[] = []
  private currentUrl = ""

  constructor(
    private readonly client: CdpClient,
    private readonly sessionId: string,
  ) {}

  async navigate(url: string): Promise<PageSnapshot> {
    const settled = this.waitForNetworkIdle(NAVIGATION_TIMEOUT_MS)
    await this.client.send("Page.navigate", { url }, this.sessionId)
    await settled
    this.currentUrl = url
    return this.readPage()
  }

  async readPage(): Promise<PageSnapshot> {
    const { nodes } = await this.client.send<{ nodes: AXNode[] }>("Accessibility.getFullAXTree", {}, this.sessionId)
    const { text, elements, elementBackendIds } = parseAxTree(nodes)
    this.lastElementBackendIds = elementBackendIds

    let url = this.currentUrl
    let title = ""
    try {
      const evalResult = await this.client.send<{ result: { value?: { url: string; title: string } } }>(
        "Runtime.evaluate",
        { expression: "({ url: location.href, title: document.title })", returnByValue: true },
        this.sessionId,
      )
      if (evalResult.result.value) {
        url = evalResult.result.value.url
        title = evalResult.result.value.title
      }
    } catch {
      // Fall back to the last-known URL and an empty title rather than fail
      // the whole read — a stale URL is still useful context for the agent.
    }

    return { url, title, text, elements }
  }

  async click(elementIndex: number): Promise<PageSnapshot> {
    const backendNodeId = this.lastElementBackendIds[elementIndex]
    if (backendNodeId == null) {
      throw new Error(`No element at index ${elementIndex} — call read_page first`)
    }

    await this.client.send("DOM.scrollIntoViewIfNeeded", { backendNodeId }, this.sessionId)
    const { model } = await this.client.send<{ model: { content: number[] } }>("DOM.getBoxModel", { backendNodeId }, this.sessionId)
    const [x1, y1, , , x3, y3] = model.content
    const x = (x1 + x3) / 2
    const y = (y1 + y3) / 2

    const settled = this.waitForNetworkIdle(SETTLE_TIMEOUT_MS)
    // A real synthetic click (mousePressed + mouseReleased) rather than
    // Runtime.callFunctionOn(...).click() — more robust against JS listeners
    // that expect a trusted user event.
    await this.client.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 }, this.sessionId)
    await this.client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 }, this.sessionId)
    await settled

    return this.readPage()
  }

  async goBack(): Promise<PageSnapshot> {
    const settled = this.waitForNetworkIdle(SETTLE_TIMEOUT_MS)
    await this.client.send("Runtime.evaluate", { expression: "history.back()" }, this.sessionId)
    await settled
    return this.readPage()
  }

  async close(): Promise<void> {
    this.client.close()
  }

  // Waits for a "networkIdle" lifecycle event, or the timeout — whichever
  // comes first. Never throws: a page that never settles shouldn't fail the
  // whole action, just bound how long we wait before reading it anyway.
  private waitForNetworkIdle(timeoutMs: number): Promise<void> {
    return this.client
      .once("Page.lifecycleEvent", (params) => (params as { name?: string } | null)?.name === "networkIdle", timeoutMs)
      .then(() => undefined)
  }
}

export async function connectBrowserSession(steelSession: SteelSessionLike): Promise<BrowserSession> {
  if (!steelSession.websocketUrl) {
    throw new Error("Steel session has no websocketUrl — cannot open a CDP connection")
  }

  const apiKey = process.env.STEEL_API_KEY
  const separator = steelSession.websocketUrl.includes("?") ? "&" : "?"
  const url = apiKey ? `${steelSession.websocketUrl}${separator}apiKey=${apiKey}` : steelSession.websocketUrl

  const client = new CdpClient(url)
  const sessionId = await attachToSteelSession(client)

  await Promise.all([
    client.send("Page.enable", {}, sessionId),
    client.send("Page.setLifecycleEventsEnabled", { enabled: true }, sessionId),
    client.send("DOM.enable", {}, sessionId),
    client.send("Runtime.enable", {}, sessionId),
    client.send("Accessibility.enable", {}, sessionId),
  ])

  return new CdpBrowserSession(client, sessionId)
}
