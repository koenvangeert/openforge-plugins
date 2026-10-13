import type { BoardModel } from '../lib/board'
import { filterBoardByDependency, type DependencyMode } from '../lib/dependency'
import { readIssuesFilterSelection, updateIssuesFilterSelection } from '../lib/filterSession'

/**
 * Board filter: every issue, blocked issues, blocking issues, or issues
 * with no open blocker. `getBoard` is the live board. The filtered
 * board recomputes when the source board or the mode changes.
 *
 * The chosen mode is kept in process memory for `getProjectId()`, so a new
 * page for that project starts on the same choice. Quitting OpenForge drops it.
 */
export function useIssuesDependencyFilter(
  getBoard: () => BoardModel | null,
  getProjectId: () => string | null = () => null,
) {
  let activeProjectId = getProjectId()
  let mode = $state<DependencyMode>(readIssuesFilterSelection(activeProjectId).dependencyMode)

  const sourceBoard = $derived(getBoard())
  const board = $derived(sourceBoard ? filterBoardByDependency(sourceBoard, mode) : null)
  const active = $derived(mode !== 'all')
  const isEmpty = $derived(active && board !== null && board.columns.length === 0)

  function setMode(next: DependencyMode): void {
    mode = next
    updateIssuesFilterSelection(activeProjectId, { dependencyMode: next })
  }

  function clear(): void {
    setMode('all')
  }

  function activateProject(nextProjectId: string | null): void {
    activeProjectId = nextProjectId
    mode = readIssuesFilterSelection(nextProjectId).dependencyMode
  }

  return {
    get mode() {
      return mode
    },
    set mode(value: DependencyMode) {
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

export type IssuesDependencyFilter = ReturnType<typeof useIssuesDependencyFilter>
