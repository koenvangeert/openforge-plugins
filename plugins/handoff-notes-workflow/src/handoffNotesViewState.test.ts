import { describe, expect, it } from 'vitest'
import { createHandoffNotesLoadTracker } from './handoffNotesViewState'

describe('Handoff Notes view loading state', () => {
  it('shows loading only until the active Task context has completed its first load', () => {
    const tracker = createHandoffNotesLoadTracker()

    expect(tracker.shouldShowLoading('KVG-1808', 'P-8')).toBe(true)

    tracker.markLoaded('KVG-1808', 'P-8')

    expect(tracker.shouldShowLoading('KVG-1808', 'P-8')).toBe(false)
  })

  it('shows loading again when the Task context changes', () => {
    const tracker = createHandoffNotesLoadTracker()
    tracker.markLoaded('KVG-1808', 'P-8')

    expect(tracker.shouldShowLoading('KVG-1809', 'P-8')).toBe(true)
    expect(tracker.shouldShowLoading('KVG-1808', 'P-9')).toBe(true)
    expect(tracker.shouldShowLoading('KVG-1808', null)).toBe(true)
  })
})
