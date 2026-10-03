// Filter an already-loaded board by whether each issue has an OpenForge task.
// The signal is the same task link the card already shows. A completed or
// deleted task is not a link, because the board drops those before render.

import type { BoardCard, BoardColumn, BoardModel } from './board'

/** All issues, issues with no OpenForge task, or issues that have one. */
export type TaskAssociationMode = 'all' | 'without' | 'with'

function matchesMode(card: BoardCard, mode: Exclude<TaskAssociationMode, 'all'>): boolean {
  const hasTask = card.taskLink !== null
  return mode === 'with' ? hasTask : !hasTask
}

/**
 * Keep a card only when it matches. A removed parent does not hide matching
 * descendants: those cards move up to the parent's place. Pure.
 */
function filterCardTree(card: BoardCard, mode: Exclude<TaskAssociationMode, 'all'>): BoardCard[] {
  const subIssues = card.subIssues.flatMap((child) => filterCardTree(child, mode))
  if (!matchesMode(card, mode)) return subIssues

  const unchanged =
    subIssues.length === card.subIssues.length &&
    subIssues.every((child, index) => child === card.subIssues[index])
  return [unchanged ? card : { ...card, subIssues }]
}

/**
 * Filter a board by task association. `all` returns the board unchanged.
 * Columns left with no cards are dropped. The input board is never mutated.
 */
export function filterBoardByTaskAssociation(board: BoardModel, mode: TaskAssociationMode): BoardModel {
  if (mode === 'all') return board

  const columns: BoardColumn[] = []
  for (const column of board.columns) {
    const cards = column.cards.flatMap((card) => filterCardTree(card, mode))
    if (cards.length > 0) columns.push({ ...column, cards })
  }
  return { ...board, columns }
}
