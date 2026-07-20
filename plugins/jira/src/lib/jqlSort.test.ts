import { describe, expect, it } from 'vitest'
import { getStatusSortDirection, withStatusSort } from './jqlSort'

describe('JQL status sorting', () => {
  it('adds status as the primary ordering while retaining existing secondary ordering', () => {
    expect(withStatusSort('project = KVG ORDER BY updated DESC', 'asc')).toBe(
      'project = KVG ORDER BY status ASC, updated DESC',
    )
  })

  it('toggles an existing status ordering without duplicating the field', () => {
    expect(withStatusSort('project = KVG ORDER BY updated DESC, status ASC', 'desc')).toBe(
      'project = KVG ORDER BY status DESC, updated DESC',
    )
  })

  it('does not treat ORDER BY text inside a quoted search value as a clause', () => {
    expect(withStatusSort('summary ~ "ORDER BY status"', 'asc')).toBe(
      'summary ~ "ORDER BY status" ORDER BY status ASC',
    )
  })

  it('reports status direction only when status is the primary ordering', () => {
    expect(getStatusSortDirection('project = KVG ORDER BY status ASC, updated DESC')).toBe('asc')
    expect(getStatusSortDirection('project = KVG ORDER BY updated DESC, status DESC')).toBeNull()
    expect(getStatusSortDirection('project = KVG')).toBeNull()
  })
})
