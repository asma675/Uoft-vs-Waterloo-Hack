import Anthropic from "@anthropic-ai/sdk"

import { getAnthropicClient, getMaxTurns, getModel } from "@/lib/anthropic"
import type { BrowserSession, PageSnapshot } from "@/lib/browser"
import { redactInfluenceNoise, type NoiseRedaction } from "@/lib/signal-shield"

// Structured result a Scout/Verifier agent reports via the `finish` tool.
// Shape is deliberately loose (most fields optional) since not every mission
// goal produces a price/condition — lib/aggregator.ts is the consumer and
// treats missing fields as "unknown", not as an error.
export interface AgentFinding {
  summary: string
  sourceUrl: string
  detail: string
  product?: string
  price?: number
  condition?: string
}

export interface AgentLoopResult {
  finding: AgentFinding | null
  truncated: boolean
  turnsUsed: number
  noiseRedactions: NoiseRedaction[]
}

export interface AgentLoopOptions {
  systemPrompt: string
  goal: string
  browser: BrowserSession
  maxTurns?: number
  model?: string
}

// Text-based tools only — no screenshots/images anywhere in this loop. Each
// tool result is the page's extracted text + indexed interactive elements
// (see lib/browser.ts's PageSnapshot), which keeps per-turn token cost far
// lower than a computer-use/screenshot loop would.
const TOOLS: Anthropic.Tool[] = [
  {
    name: "navigate",
    description: "Navigate the browser to an absolute URL and read the resulting page.",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Absolute URL to navigate to, e.g. https://example.com/search?q=..." },
      },
      required: ["url"],
      additionalProperties: false,
    },
  },
  {
    name: "read_page",
    description: "Re-read the current page's visible text and interactive elements without navigating.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "click",
    description: "Click an interactive element on the current page by its index from the most recent page read.",
    input_schema: {
      type: "object",
      properties: {
        element_index: { type: "integer", description: "Index of the element to click, from the elements list of the last page read" },
      },
      required: ["element_index"],
      additionalProperties: false,
    },
  },
  {
    name: "go_back",
    description: "Navigate back to the previous page.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "finish",
    description: "End the task and report your finding. Call this once you have a confident answer, or your best partial answer if you're unsure.",
    input_schema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "One-sentence summary of what you found" },
        source_url: { type: "string", description: "The URL your finding came from" },
        detail: { type: "string", description: "Any other relevant detail (shipping, availability, caveats, etc.)" },
        product: { type: "string", description: "Product or item name, if applicable" },
        price: { type: "number", description: "Price in USD, if applicable" },
        condition: { type: "string", description: "Condition (e.g. new, refurbished), if applicable" },
      },
      required: ["summary", "source_url", "detail"],
      additionalProperties: false,
    },
  },
]

// Keep only the N most recent browser tool-results at full size; older ones
// collapse to a placeholder. Bounds token growth across a long-running loop
// without losing the agent's most recent view of the page.
const KEEP_RECENT_BROWSER_RESULTS = 2
const TRIM_THRESHOLD_CHARS = 200

function trimHistory(messages: Anthropic.MessageParam[]): void {
  const toolResultMessageIndices: number[] = []
  messages.forEach((message, index) => {
    if (message.role === "user" && Array.isArray(message.content) && message.content.some((block) => block.type === "tool_result")) {
      toolResultMessageIndices.push(index)
    }
  })

  const indicesToTrim = toolResultMessageIndices.slice(0, -KEEP_RECENT_BROWSER_RESULTS)
  for (const index of indicesToTrim) {
    const message = messages[index]
    if (!Array.isArray(message.content)) continue
    message.content = message.content.map((block) => {
      if (block.type !== "tool_result") return block
      const text = typeof block.content === "string" ? block.content : ""
      if (text.length < TRIM_THRESHOLD_CHARS) return block
      return { ...block, content: "[earlier page content omitted to save tokens]" }
    })
  }
}

// Sanitizes the page text before the agent ever sees it — ads, sponsorship,
// and AI-directed manipulation are stripped here, not just flagged after the
// fact. This is what keeps a page's own marketing/injection copy from
// influencing which candidate the agent picks in the first place.
function formatSnapshot(snapshot: PageSnapshot): { content: string; redactions: NoiseRedaction[] } {
  const { text: cleanText, redactions } = redactInfluenceNoise(snapshot.text)
  const elementLines = snapshot.elements.map((element) => `[${element.index}] ${element.role}: ${element.name}`).join("\n")
  const noiseNote = redactions.length
    ? `\n\n[SignalShield pre-filtered ${redactions.length} ad/influence segment(s) from this page before you read it: ${[...new Set(redactions.map((r) => r.label))].join(", ")}]`
    : ""
  const content = `URL: ${snapshot.url}\nTitle: ${snapshot.title}\n\nText:\n${cleanText}\n\nInteractive elements:\n${elementLines || "(none found)"}${noiseNote}`
  return { content, redactions }
}

async function executeBrowserTool(browser: BrowserSession, name: string, input: Record<string, unknown>): Promise<PageSnapshot> {
  switch (name) {
    case "navigate":
      return browser.navigate(String(input.url))
    case "read_page":
      return browser.readPage()
    case "click":
      return browser.click(Number(input.element_index))
    case "go_back":
      return browser.goBack()
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

function parseFinding(input: Record<string, unknown>, fallbackUrl: string): AgentFinding {
  return {
    summary: typeof input.summary === "string" ? input.summary : "",
    sourceUrl: typeof input.source_url === "string" && input.source_url ? input.source_url : fallbackUrl,
    detail: typeof input.detail === "string" ? input.detail : "",
    product: typeof input.product === "string" ? input.product : undefined,
    price: typeof input.price === "number" ? input.price : undefined,
    condition: typeof input.condition === "string" ? input.condition : undefined,
  }
}

// Manual tool-calling loop (not the SDK's beta tool runner) so we own turn
// capping, history trimming, and browser-tool execution directly.
export async function runAgentLoop(options: AgentLoopOptions): Promise<AgentLoopResult> {
  const client = getAnthropicClient()
  const model = options.model ?? getModel()
  const maxTurns = options.maxTurns ?? getMaxTurns()
  const { browser, goal, systemPrompt } = options

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content:
        `Goal: ${goal}\n\n` +
        "Use the tools to work toward this goal — navigate to a search engine or a relevant " +
        "site, read pages, and click through as needed. Call finish() once you have a confident " +
        "answer, or your best partial answer if you run out of turns.",
    },
  ]

  let lastSnapshot: PageSnapshot | null = null
  const noiseRedactions: NoiseRedaction[] = []

  for (let turn = 1; turn <= maxTurns; turn++) {
    const response = await client.messages.create({
      model,
      max_tokens: 2000,
      output_config: { effort: "low" },
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      tools: TOOLS,
      messages,
    })

    messages.push({ role: "assistant", content: response.content })

    const toolUses = response.content.filter((block): block is Anthropic.ToolUseBlock => block.type === "tool_use")

    if (toolUses.length === 0) {
      if (response.stop_reason === "end_turn") {
        messages.push({ role: "user", content: "Please continue using the tools, or call finish() when you have an answer." })
        continue
      }
      break
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = []
    let finding: AgentFinding | null = null

    for (const call of toolUses) {
      if (call.name === "finish") {
        finding = parseFinding(call.input as Record<string, unknown>, lastSnapshot?.url ?? "")
        toolResults.push({ type: "tool_result", tool_use_id: call.id, content: "Recorded." })
        continue
      }

      try {
        const snapshot = await executeBrowserTool(browser, call.name, call.input as Record<string, unknown>)
        lastSnapshot = snapshot
        const { content, redactions } = formatSnapshot(snapshot)
        noiseRedactions.push(...redactions)
        toolResults.push({ type: "tool_result", tool_use_id: call.id, content })
      } catch (error) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: call.id,
          content: `Error: ${error instanceof Error ? error.message : String(error)}`,
          is_error: true,
        })
      }
    }

    messages.push({ role: "user", content: toolResults })
    trimHistory(messages)

    if (finding) {
      return { finding, truncated: false, turnsUsed: turn, noiseRedactions }
    }
  }

  return {
    finding: lastSnapshot
      ? {
          summary: "Turn limit reached before a confident finish() call.",
          sourceUrl: lastSnapshot.url,
          detail: redactInfluenceNoise(lastSnapshot.text).text.slice(0, 300),
        }
      : null,
    truncated: true,
    turnsUsed: maxTurns,
    noiseRedactions,
  }
}
