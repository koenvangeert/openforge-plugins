import type { BoardModel } from '../lib/board'
import { readIssuesFilterSelection, updateIssuesFilterSelection } from '../lib/filterSession'
import { filterBoardByTaskAssociation, type TaskAssociationMode } from '../lib/taskAssociation'

/**
 * Three-way board filter: every issue, issues with no OpenForge task, or
 * issues that have one. `getBoard` is the live board. The filtered board
 * recomputes when the source board or the mode changes.
 *
 * The chosen mode is kept in process memory for `getProjectId()`, so a new
 * page for that project starts on the same choice. Quitting OpenForge drops it.
 */
export function useIssuesTaskFilter(
  getBoard: () => BoardModel | null,
  getProjectId: () => string | null = () => null,
) {
  let activeProjectId = getProjectId()
  let mode = $state<TaskAssociationMode>(readIssuesFilterSelection(activeProjectId).taskMode)

  const sourceBoard = $derived(getBoard())
  const board = $derived(sourceBoard ? filterBoardByTaskAssociation(sourceBoard, mode) : null)
  const active = $derived(mode !== 'all')
  const isEmpty = $derived(active && board !== null && board.columns.length === 0)

  function setMode(next: TaskAssociationMode): void {
    mode = next
    updateIssuesFilterSelection(activeProjectId, { taskMode: next })
  }

  function clear(): void {
    setMode('all')
  }

  function activateProject(nextProjectId: string | null): void {
    activeProjectId = nextProjectId
    mode = readIssuesFilterSelection(nextProjectId).taskMode
  }

  return {
    get mode() {
      return mode
    },
    set mode(value: TaskAssociationMode) {
      setMode(value)
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
    activateProject,
  }
}

export type IssuesTaskFilter = ReturnType<typeof useIssuesTaskFilter>
