import { describe, expect, it } from 'vitest'
import type { BoardCard, IssueTaskLink } from './board'
import {
  modelFromIssuesBoard,
  patchBoardCardValue,
  patchBoardLabelColor,
  reconcilePendingCreatedCards,
} from './boardModel'
import type { IssuesBoard } from './types'

const rawBoard: IssuesBoard = {
  repo: { owner: 'octo', name: 'cat' },
  issues: [
    {
      number: 7,
      title: 'Hydrate me',
      body: 'Body',
      state: 'open',
      html_url: 'https://github.com/octo/cat/issues/7',
      labels: [{ name: 'alpha', color: 'ff0000' }],
    },
  ],
  labels: [{ name: 'alpha', color: 'ff0000' }],
  values: { '7': 8 },
  columnLabels: ['alpha'],
}

const taskLink: IssueTaskLink = {
  taskId: 'T-7',
  sessionId: 'session-7',
  workspacePath: '/tmp/T-7',
  repo: 'octo/cat',
  title: 'Hydrate me',
}

const pendingCard: BoardCard = {
  issueNumber: 9,
  title: 'Eventually consistent',
  body: '',
  labels: [],
  value: null,
  taskLink: null,
}

describe('board model', () => {
  it('hydrates backend wire data and task links into the board model', () => {
    const model = modelFromIssuesBoard(rawBoard, { 7: taskLink })

    expect(model.repo).toBe('octo/cat')
    expect(model.columns[0]?.color).toBe('ff0000')
    expect(model.columns[0]?.cards[0]).toMatchObject({
      issueNumber: 7,
      value: 8,
      taskLink,
    })
  })

  it('keeps pending created cards until the backend listing catches up', () => {
    const model = modelFromIssuesBoard(rawBoard)

    const stale = reconcilePendingCreatedCards(model, rawBoard, [pendingCard])
    expect(stale.pendingCards).toEqual([pendingCard])
    expect(stale.board.columns.at(-1)?.cards.map((card) => card.issueNumber)).toContain(9)

    const caughtUpRaw: IssuesBoard = {
      ...rawBoard,
      issues: [
        ...rawBoard.issues,
        {
          number: 9,
          title: pendingCard.title,
          body: pendingCard.body,
          state: 'open',
          html_url: 'https://github.com/octo/cat/issues/9',
          labels: [],
        },
      ],
    }
    const caughtUp = reconcilePendingCreatedCards(
      modelFromIssuesBoard(caughtUpRaw),
      caughtUpRaw,
      stale.pendingCards,
    )

    expect(caughtUp.pendingCards).toEqual([])
    expect(caughtUp.board.columns.at(-1)?.cards.filter((card) => card.issueNumber === 9)).toHaveLength(1)
  })

  it('applies optimistic value and label-color patches immutably', () => {
    const model = modelFromIssuesBoard(rawBoard)
    const valued = patchBoardCardValue(model, 7, 4)
    const recolored = patchBoardLabelColor(valued, 'alpha', 'abcdef')

    expect(recolored.columns[0]?.cards[0]?.value).toBe(4)
    expect(recolored.columns[0]?.color).toBe('abcdef')
    expect(model.columns[0]?.cards[0]?.value).toBe(8)
    expect(model.columns[0]?.color).toBe('ff0000')
  })
})
