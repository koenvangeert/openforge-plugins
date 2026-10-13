import { beforeEach, describe, expect, it } from 'vitest'
import { emptyHierarchy, type BoardModel, type IssueTaskLink } from '../lib/board'
import { clearIssuesFilterSession } from '../lib/filterSession'
import { useIssuesTaskFilter } from './useIssuesTaskFilter.svelte'

const link: IssueTaskLink = {
  taskId: 'T-2',
  sessionId: 'session-2',
  workspacePath: '/tmp/t-2',
  repo: 'octo/cat',
  title: null,
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
          { issueNumber: 1, title: 'No task yet', body: null, labels: ['bug'], value: null, taskLink: null, ...emptyHierarchy() },
          { issueNumber: 2, title: 'Already started', body: null, labels: ['bug'], value: null, taskLink: link, ...emptyHierarchy() },
        ],
      },
    ],
  }
}

describe('useIssuesTaskFilter', () => {
  it('shows the full board until a mode is chosen', () => {
    const board = makeBoard()
    const filter = useIssuesTaskFilter(() => board)

    expect(filter.mode).toBe('all')
    expect(filter.active).toBe(false)
    expect(filter.isEmpty).toBe(false)
    expect(filter.board).toBe(board)
  })

  it('hides issues that have a task, then shows only those issues', () => {
    const board = makeBoard()
    const filter = useIssuesTaskFilter(() => board)

    filter.setMode('without')
    expect(filter.active).toBe(true)
    expect(filter.board!.columns[0]!.cards.map((card) => card.issueNumber)).toEqual([1])

    filter.setMode('with')
    expect(filter.board!.columns[0]!.cards.map((card) => card.issueNumber)).toEqual([2])
  })

  it('reports an empty board when the chosen mode matches nothing', () => {
    const board = makeBoard()
    board.columns[0]!.cards = board.columns[0]!.cards.filter((card) => card.taskLink === null)
    const filter = useIssuesTaskFilter(() => board)

    filter.setMode('with')

    expect(filter.isEmpty).toBe(true)
    expect(filter.board!.columns).toEqual([])
  })

  it('clear() returns to every issue', () => {
    const board = makeBoard()
    const filter = useIssuesTaskFilter(() => board)
    filter.setMode('without')

    filter.clear()

    expect(filter.mode).toBe('all')
    expect(filter.board).toBe(board)
  })
})

describe('useIssuesTaskFilter session', () => {
  beforeEach(() => {
    clearIssuesFilterSession()
  })

  it('starts a new filter on the mode saved for that project', () => {
    const board = makeBoard()
    const first = useIssuesTaskFilter(() => board, () => 'proj-1')
    first.setMode('without')

    const second = useIssuesTaskFilter(() => board, () => 'proj-1')

    expect(second.mode).toBe('without')
    expect(second.board!.columns[0]!.cards.map((card) => card.issueNumber)).toEqual([1])
  })

  it('keeps a separate mode for each project', () => {
    const board = makeBoard()
    const filter = useIssuesTaskFilter(() => board, () => 'proj-1')
    filter.setMode('without')

    filter.activateProject('proj-2')
    expect(filter.mode).toBe('all')
    expect(filter.board).toBe(board)

    filter.setMode('with')
    filter.activateProject('proj-1')

    expect(filter.mode).toBe('without')
    expect(filter.board!.columns[0]!.cards.map((card) => card.issueNumber)).toEqual([1])
  })

  it('clear() drops the saved mode for the active project', () => {
    const board = makeBoard()
    const filter = useIssuesTaskFilter(() => board, () => 'proj-1')
    filter.setMode('without')

    filter.clear()

    const next = useIssuesTaskFilter(() => board, () => 'proj-1')
    expect(next.mode).toBe('all')
    expect(next.board).toBe(board)
  })
})
