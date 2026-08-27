import { flattenCards, type BoardCard, type BoardColumn, type BoardModel } from '../lib/board'
import { stepIndex } from '../lib/queue'

export interface IssuesDrawerQueue {
  groupTitle: string
  issueNumbers: number[]
  index: number
}

export function useIssuesDrawer(getBoard: () => BoardModel | null) {
  let open = $state<IssuesDrawerQueue | null>(null)

  function presentIssueNumbers(): Set<number> {
    const present = new Set<number>()
    const board = getBoard()
    if (board) {
      for (const column of board.columns) {
        for (const card of flattenCards(column.cards)) {
          present.add(card.issueNumber)
        }
      }
    }
    return present
  }

  function selectedCard(): BoardCard | null {
    const issueNumber = openIssueNumber()
    const board = getBoard()
    if (issueNumber === null || !board) return null

    for (const column of board.columns) {
      const card = flattenCards(column.cards).find((candidate) => candidate.issueNumber === issueNumber)
      if (card) return card
    }
    return null
  }

  function openIssueNumber(): number | null {
    return open ? (open.issueNumbers[open.index] ?? null) : null
  }

  function openFrom(card: BoardCard, column: BoardColumn): void {
    const issueNumbers = flattenCards(column.cards).map((candidate) => candidate.issueNumber)
    open = {
      groupTitle: column.title,
      issueNumbers,
      index: issueNumbers.indexOf(card.issueNumber),
    }
  }

  function go(direction: 1 | -1): void {
    if (!open) return
    const index = stepIndex(
      open.issueNumbers,
      open.index,
      direction,
      presentIssueNumbers(),
    )
    open = index === null ? null : { ...open, index }
  }

  function advancePastClosed(closedIssueNumber: number): void {
    if (!open) return
    const remaining = presentIssueNumbers()
    remaining.delete(closedIssueNumber)
    const index = stepIndex(open.issueNumbers, open.index, 1, remaining)
    open = index === null ? null : { ...open, index }
  }

  function close(): void {
    open = null
  }

  return {
    get open() {
      return open
    },
    get openIssueNumber() {
      return openIssueNumber()
    },
    get selectedCard() {
      return selectedCard()
    },
    openFrom,
    go,
    advancePastClosed,
    close,
  }
}

export type IssuesDrawer = ReturnType<typeof useIssuesDrawer>
