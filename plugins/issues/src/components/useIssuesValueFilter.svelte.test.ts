import { beforeEach, describe, expect, it } from 'vitest'
import { clearIssuesFilterSession } from '../lib/filterSession'
import { useIssuesValueFilter } from './useIssuesValueFilter.svelte'

describe('useIssuesValueFilter session', () => {
  beforeEach(() => {
    clearIssuesFilterSession()
  })

  it('starts a new filter on the chips saved for that project', () => {
    const first = useIssuesValueFilter(() => null, () => 'proj-1')
    first.toggleValue(3)
    first.toggleValue('none')

    const second = useIssuesValueFilter(() => null, () => 'proj-1')

    expect(second.hasSelection).toBe(true)
    expect(second.selectedValues).toEqual(new Set([3, 'none']))
  })

  it('keeps a separate chip set for each project', () => {
    const filter = useIssuesValueFilter(() => null, () => 'proj-1')
    filter.toggleValue(4)

    filter.activateProject('proj-2')
    expect(filter.hasSelection).toBe(false)

    filter.toggleValue(1)
    filter.activateProject('proj-1')

    expect(filter.selectedValues).toEqual(new Set([4]))
  })

  it('clear() drops the saved chips for the active project', () => {
    const filter = useIssuesValueFilter(() => null, () => 'proj-1')
    filter.toggleValue(2)

    filter.clear()

    const next = useIssuesValueFilter(() => null, () => 'proj-1')
    expect(next.hasSelection).toBe(false)
    expect(next.selectedValues).toEqual(new Set())
  })
})
