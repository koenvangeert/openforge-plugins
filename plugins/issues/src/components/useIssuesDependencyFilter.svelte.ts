import type { BoardModel } from '../lib/board'
import { filterBoardByDependency, type DependencyMode } from '../lib/dependency'

/**
 * Board filter: every issue, blocked issues, blocking issues, or issues
 * with no open blocker. `getBoard` is the live board. The filtered
 * board recomputes when the source board or the mode changes.
 */
export function useIssuesDependencyFilter(getBoard: () => BoardModel | null) {
  let mode = $state<DependencyMode>('all')

  const sourceBoard = $derived(getBoard())
  const board = $derived(sourceBoard ? filterBoardByDependency(sourceBoard, mode) : null)
  const active = $derived(mode !== 'all')
  const isEmpty = $derived(active && board !== null && board.columns.length === 0)

  function setMode(next: DependencyMode): void {
    mode = next
  }

  function clear(): void {
    mode = 'all'
  }

  return {
    get mode() {
      return mode
    },
    set mode(value: DependencyMode) {
      mode = value
    },
    get board() {
      return board
    },
    get active() {
      return active
    },
    get isEmpty() {
      return isEmpty
    },
    setMode,
    clear,
  }
}

export type IssuesDependencyFilter = ReturnType<typeof useIssuesDependencyFilter>
