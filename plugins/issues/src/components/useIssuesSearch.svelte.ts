import type { BoardModel } from '../lib/board'
import { parseQuery, filterBoard, countIssues, countMatchingIssues } from '../lib/search'

/**
 * Board-local keyword search. `getBoard` is the same style of live-board accessor
 * `useIssuesDrawer` takes: the filtered board and counts recompute reactively
 * whenever the source board changes (edits, refresh) or the query changes.
 */
export function useIssuesSearch(getBoard: () => BoardModel | null) {
  let query = $state('')

  const terms = $derived(parseQuery(query))
  const sourceBoard = $derived(getBoard())
  const board = $derived(sourceBoard ? filterBoard(sourceBoard, terms) : null)
  const matchCount = $derived(
    sourceBoard
      ? terms.length === 0
        ? countIssues(sourceBoard)
        : countMatchingIssues(sourceBoard, terms)
      : 0,
  )
  const totalCount = $derived(sourceBoard ? countIssues(sourceBoard) : 0)
  const active = $derived(terms.length > 0)

  function clear(): void {
    query = ''
  }

  return {
    get query() {
      return query
    },
    set query(value: string) {
      query = value
    },
    get terms() {
      return terms
    },
    get board() {
      return board
    },
    get matchCount() {
      return matchCount
    },
    get totalCount() {
      return totalCount
    },
    get active() {
      return active
    },
    clear,
  }
}

export type IssuesSearch = ReturnType<typeof useIssuesSearch>
