import type { BrowserSession } from "@/lib/browser"

export interface ExecutorResult {
  finalUrl: string
  detail: string
}

// No LLM call needed — navigate to the winning, human-approved URL and stop.
// Never submits/purchases anything; that's a hard product constraint, not
// just a hackathon-safety nicety.
export async function runExecutor(targetUrl: string, browser: BrowserSession): Promise<ExecutorResult> {
  const snapshot = await browser.navigate(targetUrl)
  return {
    finalUrl: snapshot.url,
    detail: "Navigated to the approved listing and stopped before any purchase or submit action.",
  }
}
