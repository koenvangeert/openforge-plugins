import type { BoardModel } from '../lib/board'
import { filterBoardByTaskAssociation, type TaskAssociationMode } from '../lib/taskAssociation'

/**
 * Three-way board filter: every issue, issues with no OpenForge task, or
 * issues that have one. `getBoard` is the live board. The filtered board
 * recomputes when the source board or the mode changes.
 */
export function useIssuesTaskFilter(getBoard: () => BoardModel | null) {
  let mode = $state<TaskAssociationMode>('all')

  const sourceBoard = $derived(getBoard())
  const board = $derived(sourceBoard ? filterBoardByTaskAssociation(sourceBoard, mode) : null)
  const active = $derived(mode !== 'all')
  const isEmpty = $derived(active && board !== null && board.columns.length === 0)

  function setMode(next: TaskAssociationMode): void {
    mode = next
  }

  function clear(): void {
    mode = 'all'
  }

  return {
    get mode() {
      return mode
    },
    set mode(value: TaskAssociationMode) {
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

export type IssuesTaskFilter = ReturnType<typeof useIssuesTaskFilter>
