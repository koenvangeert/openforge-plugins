import type { BoardModel } from '../lib/board'
import {
  readIssuesFilterSelection,
  updateIssuesFilterSelection,
  type IssuesFilterValue,
} from '../lib/filterSession'
import { filterBoardByValue } from '../lib/search'

/**
 * Value filter for the board. Manages selected value chips (1-10 and "none").
 * When values are selected, the board is filtered to show only cards with those values.
 *
 * The chosen chips are kept in process memory for `getProjectId()`, so a new
 * page for that project starts on the same chips. Quitting OpenForge drops them.
 */
export function useIssuesValueFilter(
  getBoard: () => BoardModel | null,
  getProjectId: () => string | null = () => null,
) {
  let activeProjectId = getProjectId()
  let selectedValues = $state<Set<IssuesFilterValue>>(
    new Set(readIssuesFilterSelection(activeProjectId).values),
  )

  const sourceBoard = $derived(getBoard())
  const board = $derived(sourceBoard ? filterBoardByValue(sourceBoard, selectedValues) : null)
  const hasSelection = $derived(selectedValues.size > 0)

  function persist(): void {
    updateIssuesFilterSelection(activeProjectId, { values: [...selectedValues] })
  }

  function toggleValue(value: IssuesFilterValue): void {
    const newSet = new Set(selectedValues)
    if (newSet.has(value)) {
      newSet.delete(value)
    } else {
      newSet.add(value)
    }
    selectedValues = newSet
    persist()
  }

  function clear(): void {
    selectedValues = new Set()
    persist()
  }

  function activateProject(nextProjectId: string | null): void {
    activeProjectId = nextProjectId
    selectedValues = new Set(readIssuesFilterSelection(nextProjectId).values)
  }

  return {
    get selectedValues() {
      return selectedValues
    },
    get board() {
      return board
    },
    get hasSelection() {
      return hasSelection
    },
    toggleValue,
    clear,
    activateProject,
  }
}

export type IssuesValueFilter = ReturnType<typeof useIssuesValueFilter>
