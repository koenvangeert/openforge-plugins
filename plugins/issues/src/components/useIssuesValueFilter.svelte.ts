import type { BoardModel } from '../lib/board'
import { filterBoardByValue } from '../lib/search'

/**
 * Value filter for the board. Manages selected value chips (1-10 and "none").
 * When values are selected, the board is filtered to show only cards with those values.
 */
export function useIssuesValueFilter(getBoard: () => BoardModel | null) {
  let selectedValues = $state<Set<number | 'none'>>(new Set())

  const sourceBoard = $derived(getBoard())
  const board = $derived(sourceBoard ? filterBoardByValue(sourceBoard, selectedValues) : null)
  const hasSelection = $derived(selectedValues.size > 0)

  function toggleValue(value: number | 'none'): void {
    const newSet = new Set(selectedValues)
    if (newSet.has(value)) {
      newSet.delete(value)
    } else {
      newSet.add(value)
    }
    selectedValues = newSet
  }

  function clear(): void {
    selectedValues = new Set()
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
  }
}

export type IssuesValueFilter = ReturnType<typeof useIssuesValueFilter>
