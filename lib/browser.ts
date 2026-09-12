// Single stable import path for browser automation, used by every module
// that drives a browser (lib/agent-loop.ts, lib/agents/*,
// lib/mission-runtime.ts). lib/browser-actions.ts is the real CDP-backed
// implementation; lib/browser-actions.mock.ts is a fixture-backed
// implementation of the same interface, used for local development and the
// aggregator/injection-detection tests that don't need a live Steel session.
//
// Swap this one line to fall back to the mock (e.g. while iterating without
// a STEEL_API_KEY):
//   export * from "@/lib/browser-actions.mock"
export * from "@/lib/browser-actions"
