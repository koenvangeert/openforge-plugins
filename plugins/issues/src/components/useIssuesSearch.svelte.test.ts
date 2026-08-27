import { describe, expect, it } from 'vitest'
import { emptyHierarchy, type BoardModel } from '../lib/board'
import { useIssuesSearch } from './useIssuesSearch.svelte'

function makeBoard(): BoardModel {
  return {
    repo: 'octo/cat',
    columns: [
      {
        label: 'bug',
        isOther: false,
        title: 'bug',
        color: null,
        cards: [
          { issueNumber: 1, title: 'Refresh token expiry', body: 'auth handshake', labels: ['bug'], value: null, taskLink: null, ...emptyHierarchy() },
          { issueNumber: 2, title: 'Unrelated crash', body: null, labels: ['bug'], value: null, taskLink: null, ...emptyHierarchy() },
        ],
      },
      {
        label: '',
        isOther: true,
        title: 'No label / Other',
        color: null,
        cards: [
          { issueNumber: 3, title: 'auth docs are stale', body: null, labels: [], value: null, taskLink: null, ...emptyHierarchy() },
        ],
      },
    ],
  }
}

describe('useIssuesSearch', () => {
  it('returns the source board unfiltered when the query is empty', () => {
    const board = makeBoard()
    const search = useIssuesSearch(() => board)

    expect(search.board).toBe(board)
    expect(search.active).toBe(false)
    expect(search.matchCount).toBe(3)
    expect(search.totalCount).toBe(3)
  })

  it('filters the board reactively as the query changes', () => {
    const board = makeBoard()
    const search = useIssuesSearch(() => board)

    search.query = 'auth'

    expect(search.active).toBe(true)
    expect(search.matchCount).toBe(2)
    expect(search.totalCount).toBe(3)
    expect(search.board!.columns.map((c) => c.label)).toEqual(['bug', ''])
    expect(search.board!.columns[0]!.cards.map((c) => c.issueNumber)).toEqual([1])
  })

  it('recomputes when the source board reference changes (edit/refresh)', () => {
    let board = makeBoard()
    const search = useIssuesSearch(() => board)
    search.query = 'crash'

    expect(search.matchCount).toBe(1)

    // Simulate a refresh that removes the matching issue.
    board = {
      ...board,
      columns: board.columns.map((col) => ({
        ...col,
        cards: col.cards.filter((card) => card.issueNumber !== 2),
      })),
    }

    expect(search.matchCount).toBe(0)
  })

  it('clear() resets the query and un-filters the board', () => {
    const board = makeBoard()
    const search = useIssuesSearch(() => board)
    search.query = 'auth'

    search.clear()

    expect(search.query).toBe('')
    expect(search.active).toBe(false)
    expect(search.board).toBe(board)
  })

  it('returns null when there is no source board', () => {
    const search = useIssuesSearch(() => null)
    expect(search.board).toBeNull()
    expect(search.matchCount).toBe(0)
    expect(search.totalCount).toBe(0)
  })
})
