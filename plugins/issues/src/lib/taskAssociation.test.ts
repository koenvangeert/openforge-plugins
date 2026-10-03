import { describe, expect, it } from 'vitest'
import { buildBoard, type IssueTaskLink } from './board'
import { filterBoardByTaskAssociation } from './taskAssociation'

const link = (taskId: string): IssueTaskLink => ({
  taskId,
  sessionId: `session-${taskId}`,
  workspacePath: `/tmp/${taskId}`,
  repo: 'a/b',
  title: null,
})

function board() {
  return buildBoard({
    repo: 'a/b',
    issues: [
      { number: 1, title: 'Parent with no task', body: null, labels: ['bug'] },
      { number: 2, title: 'Child with a task', body: null, labels: ['bug'], parentIssueNumber: 1 },
      { number: 3, title: 'Sibling with no task', body: null, labels: ['bug'] },
      { number: 4, title: 'Feature with a task', body: null, labels: ['feature'] },
    ],
    columnLabels: ['bug', 'feature'],
    values: {},
    taskLinks: {
      2: link('T-2'),
      4: link('T-4'),
    },
  })
}

describe('filterBoardByTaskAssociation', () => {
  it('returns the same board when the mode is all', () => {
    const source = board()
    expect(filterBoardByTaskAssociation(source, 'all')).toBe(source)
  })

  it('hides issues that have an OpenForge task and keeps the rest', () => {
    const out = filterBoardByTaskAssociation(board(), 'without')
    const bug = out.columns.find((column) => column.label === 'bug')!
    expect(bug.cards.map((card) => card.issueNumber)).toEqual([3, 1])
    expect(bug.cards.find((card) => card.issueNumber === 1)!.subIssues).toEqual([])
    expect(out.columns.map((column) => column.label)).toEqual(['bug'])
  })

  it('shows only issues that have an OpenForge task', () => {
    const out = filterBoardByTaskAssociation(board(), 'with')
    expect(out.columns.map((column) => column.label)).toEqual(['bug', 'feature'])
    expect(out.columns.find((column) => column.label === 'bug')!.cards.map((card) => card.issueNumber)).toEqual([2])
    expect(out.columns.find((column) => column.label === 'feature')!.cards.map((card) => card.issueNumber)).toEqual([4])
  })

  it('promotes a matching nested issue when its parent is hidden', () => {
    const out = filterBoardByTaskAssociation(board(), 'with')
    const promoted = out.columns.find((column) => column.label === 'bug')!.cards[0]!
    expect(promoted.issueNumber).toBe(2)
    expect(promoted.taskLink?.taskId).toBe('T-2')
  })

  it('does not mutate the source board', () => {
    const source = board()
    const before = JSON.stringify(source)
    filterBoardByTaskAssociation(source, 'without')
    filterBoardByTaskAssociation(source, 'with')
    expect(JSON.stringify(source)).toBe(before)
  })
})
