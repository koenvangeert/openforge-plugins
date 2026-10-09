import { describe, expect, it } from 'vitest'
import { emptyHierarchy, type BoardModel, type IssueRelation } from '../lib/board'
import { useIssuesDependencyFilter } from './useIssuesDependencyFilter.svelte'

const blocker: IssueRelation = {
  number: 9,
  title: 'Schema',
  htmlUrl: 'https://github.com/octo/cat/issues/9',
  state: 'open',
  repo: 'octo/cat',
}

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
          { issueNumber: 1, title: 'Ready', body: null, labels: ['bug'], value: null, taskLink: null, ...emptyHierarchy() },
          {
            issueNumber: 2,
            title: 'Waiting',
            body: null,
            labels: ['bug'],
            value: null,
            taskLink: null,
            ...emptyHierarchy(),
            blockedBy: [blocker],
            blockedByOpenCount: 1,
          },
        ],
      },
    ],
  }
}

describe('useIssuesDependencyFilter', () => {
  it('shows the full board until a mode is chosen', () => {
    const board = makeBoard()
    const filter = useIssuesDependencyFilter(() => board)

    expect(filter.mode).toBe('all')
    expect(filter.active).toBe(false)
    expect(filter.isEmpty).toBe(false)
    expect(filter.board).toBe(board)
  })

  it('hides unblocked issues, then shows only unblocked issues', () => {
    const board = makeBoard()
    const filter = useIssuesDependencyFilter(() => board)

    filter.setMode('blocked')
    expect(filter.active).toBe(true)
    expect(filter.board!.columns[0]!.cards.map((card) => card.issueNumber)).toEqual([2])

    filter.setMode('unblocked')
    expect(filter.board!.columns[0]!.cards.map((card) => card.issueNumber)).toEqual([1])
  })

  it('shows only issues that block other work', () => {
    const board = makeBoard()
    const ready = board.columns[0]!.cards[0]!
    board.columns[0]!.cards[0] = { ...ready, blocking: [blocker], blockingOpenCount: 1 }
    const filter = useIssuesDependencyFilter(() => board)

    filter.setMode('blocking')

    expect(filter.board!.columns[0]!.cards.map((card) => card.issueNumber)).toEqual([1])
  })

  it('reports an empty board when the chosen mode matches nothing', () => {
    const board = makeBoard()
    board.columns[0]!.cards = board.columns[0]!.cards.filter((card) => card.blockedByOpenCount === 0)
    const filter = useIssuesDependencyFilter(() => board)

    filter.setMode('blocked')

    expect(filter.isEmpty).toBe(true)
    expect(filter.board!.columns).toEqual([])
  })

  it('clear() returns to every issue', () => {
    const board = makeBoard()
    const filter = useIssuesDependencyFilter(() => board)
    filter.setMode('blocked')

    filter.clear()

    expect(filter.mode).toBe('all')
    expect(filter.board).toBe(board)
  })
})
