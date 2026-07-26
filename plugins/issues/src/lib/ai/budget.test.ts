import { describe, expect, it } from 'vitest'
import { AI_BUDGET_MS, HOST_DEADLINE_MS } from './budget'

// A transport that allows itself longer than the host does not get more time — it
// loses control of the failure, and the host's generic timeout message replaces the
// one the transport worked out. These guard the arithmetic that keeps that from
// happening; the per-transport ceilings are derived from AI_BUDGET_MS.
describe('the Refine time budget', () => {
  it('leaves the host deadline room for the surrounding work', () => {
    expect(AI_BUDGET_MS).toBeLessThan(HOST_DEADLINE_MS)
  })

  it('matches the host deadline it is derived from', () => {
    // Mirrors src-tauri/src/plugin_rpc.rs DEFAULT_TIMEOUT; if that moves, this must.
    expect(HOST_DEADLINE_MS).toBe(30_000)
  })

  // Groq splits the budget across a primary and a backup model. Both attempts have to
  // land inside it, or the fallback can never deliver and is pure cost.
  it('still fits when split across two attempts', () => {
    expect(Math.floor(AI_BUDGET_MS / 2) * 2).toBeLessThan(HOST_DEADLINE_MS)
  })
})
