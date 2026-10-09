// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'
import Board from './Board.svelte'
import { emptyHierarchy, type BoardCard, type BoardColumn } from '../lib/board'

const columns: BoardColumn[] = [
  { label: 'bug', isOther: false, title: 'bug', color: null, cards: [] },
  { label: '', isOther: true, title: 'No label / Other', color: null, cards: [] },
]

const bugCard: BoardCard = {
  issueNumber: 1,
  title: 'Fix the thing',
  body: null,
  labels: ['bug'],
  value: null,
  taskLink: null,
  ...emptyHierarchy(),
}

const columnsWithCard: BoardColumn[] = [
  { label: 'bug', isOther: false, title: 'bug', color: null, cards: [bugCard] },
  { label: '', isOther: true, title: 'No label / Other', color: null, cards: [] },
]

function props(onAddCard = vi.fn()) {
  return {
    columns,
    repo: 'octo/cat',
    onCardClick: vi.fn(),
    onOpenUrl: vi.fn(),
    onOpenTask: vi.fn(),
    onCopyLink: vi.fn(),
    onSetValue: vi.fn(),
    onRecolor: vi.fn(),
    onStart: vi.fn(),
    onAddCard,
    onMoveCard: vi.fn(),
    onToggleCollapsed: vi.fn(),
  }
}

// jsdom doesn't implement the drag-and-drop DataTransfer object, so the events fired at
// the handlers are plain Events with a stubbed-in `dataTransfer`, not real DragEvents.
function fakeDataTransfer() {
  return { setData: vi.fn(), getData: vi.fn(), effectAllowed: '', dropEffect: '' }
}

function dragEvent(type: string, dataTransfer: ReturnType<typeof fakeDataTransfer>): Event {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', { value: dataTransfer, configurable: true })
  return event
}

describe('Board card actions', () => {
  it('starts a task from the card without opening the card or a menu', async () => {
    const onStart = vi.fn()
    const onCardClick = vi.fn()
    render(Board, { props: { ...props(), columns: columnsWithCard, onStart, onCardClick } })

    expect(screen.queryByRole('menu', { name: 'Issue actions' })).toBeNull()

    await fireEvent.click(screen.getByRole('button', { name: 'Start a task' }))

    expect(onStart).toHaveBeenCalledWith(bugCard)
    expect(onCardClick).not.toHaveBeenCalled()
  })

  it('copies the issue link without opening the issue', async () => {
    const onCopyLink = vi.fn()
    const onOpenUrl = vi.fn()
    const onCardClick = vi.fn()
    render(Board, { props: { ...props(), columns: columnsWithCard, onCopyLink, onOpenUrl, onCardClick } })

    await fireEvent.click(screen.getByRole('button', { name: 'Copy issue link' }))

    expect(onCopyLink).toHaveBeenCalledWith(1)
    expect(onOpenUrl).not.toHaveBeenCalled()
    expect(onCardClick).not.toHaveBeenCalled()
  })
})

describe('Board column create actions', () => {
  it('opens create for a labeled column', async () => {
    const onAddCard = vi.fn()
    render(Board, { props: props(onAddCard) })

    await fireEvent.click(screen.getByRole('button', { name: 'Create issue in bug' }))

    expect(onAddCard).toHaveBeenCalledWith('bug')
  })

  it('opens create without labels from Other', async () => {
    const onAddCard = vi.fn()
    render(Board, { props: props(onAddCard) })

    await fireEvent.click(screen.getByRole('button', { name: 'Create issue with no label' }))

    expect(onAddCard).toHaveBeenCalledWith('')
  })
})

describe('Board drag and drop', () => {
  it('moves a card to another column on drop', async () => {
    const onMoveCard = vi.fn()
    const { container } = render(Board, { props: { ...props(), columns: columnsWithCard, onMoveCard } })

    const cardWrapper = screen.getByText('Fix the thing').closest('[draggable]') as HTMLElement
    const otherList = container.querySelectorAll('.issues-column')[1].children[1] as HTMLElement

    const dt = fakeDataTransfer()
    await fireEvent(cardWrapper, dragEvent('dragstart', dt))
    await fireEvent(otherList, dragEvent('dragover', dt))
    await fireEvent(otherList, dragEvent('drop', dt))

    expect(onMoveCard).toHaveBeenCalledWith(1, 'bug', '')
  })

  it('is a no-op when a card is dropped back on its own column', async () => {
    const onMoveCard = vi.fn()
    const { container } = render(Board, { props: { ...props(), columns: columnsWithCard, onMoveCard } })

    const cardWrapper = screen.getByText('Fix the thing').closest('[draggable]') as HTMLElement
    const bugList = container.querySelectorAll('.issues-column')[0].children[1] as HTMLElement

    const dt = fakeDataTransfer()
    await fireEvent(cardWrapper, dragEvent('dragstart', dt))
    await fireEvent(bugList, dragEvent('dragover', dt))
    await fireEvent(bugList, dragEvent('drop', dt))

    expect(onMoveCard).not.toHaveBeenCalled()
  })

  it('dims the dragged card and highlights a valid target column, clearing on drag-leave', async () => {
    const { container } = render(Board, { props: { ...props(), columns: columnsWithCard } })

    const cardWrapper = screen.getByText('Fix the thing').closest('[draggable]') as HTMLElement
    const otherList = container.querySelectorAll('.issues-column')[1].children[1] as HTMLElement

    const dt = fakeDataTransfer()
    await fireEvent(cardWrapper, dragEvent('dragstart', dt))
    expect(cardWrapper.className).toContain('opacity-40')

    await fireEvent(otherList, dragEvent('dragover', dt))
    expect(otherList.className).toContain('outline-primary')

    await fireEvent(otherList, dragEvent('dragleave', dt))
    expect(otherList.className).not.toContain('outline-primary')
  })

  it('does not let a card be dragged while the board is busy', async () => {
    const { container } = render(Board, { props: { ...props(), columns: columnsWithCard, busy: true } })

    const cardWrapper = screen.getByText('Fix the thing').closest('[draggable]') as HTMLElement

    expect(cardWrapper.getAttribute('draggable')).toBe('false')
  })
})

describe('Board column collapse', () => {
  const childCard: BoardCard = { ...bugCard, issueNumber: 2, title: 'Child thing', parentIssueNumber: 1 }
  const columnsWithTree: BoardColumn[] = [
    { label: 'bug', isOther: false, title: 'bug', color: null, cards: [{ ...bugCard, subIssues: [childCard] }] },
    { label: '', isOther: true, title: 'No label / Other', color: null, cards: [] },
  ]

  it('asks to collapse an expanded column', async () => {
    const onToggleCollapsed = vi.fn()
    render(Board, { props: { ...props(), columns: columnsWithCard, onToggleCollapsed } })

    const toggle = screen.getByRole('button', { name: 'Collapse bug' })
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    await fireEvent.click(toggle)

    expect(onToggleCollapsed).toHaveBeenCalledWith('bug')
  })

  it('shows only the header and the issue count of a collapsed column', async () => {
    const onToggleCollapsed = vi.fn()
    const { container } = render(Board, {
      props: { ...props(), columns: columnsWithTree, collapsedLabels: new Set(['bug']), onToggleCollapsed },
    })

    expect(screen.queryByText('Fix the thing')).toBeNull()
    const bugColumn = container.querySelectorAll('.issues-column')[0] as HTMLElement
    expect(bugColumn.children).toHaveLength(1)
    expect(screen.getByTitle('2 issues').textContent).toBe('2')
    // The other column stays open.
    expect(screen.getByText('No issues')).toBeTruthy()

    const toggle = screen.getByRole('button', { name: 'Expand bug' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    await fireEvent.click(toggle)
    expect(onToggleCollapsed).toHaveBeenCalledWith('bug')
  })

  it('collapses the Other column by its empty label', () => {
    render(Board, { props: { ...props(), columns: columnsWithCard, collapsedLabels: new Set(['']) } })

    expect(screen.getByRole('button', { name: 'Expand No label / Other' })).toBeTruthy()
    expect(screen.queryByText('No issues')).toBeNull()
    expect(screen.getByText('Fix the thing')).toBeTruthy()
  })

  it('counts only filter results, not cards kept as context', () => {
    render(Board, {
      props: {
        ...props(),
        columns: columnsWithTree,
        collapsedLabels: new Set(['bug']),
        isResult: (card: BoardCard) => card.issueNumber === 2,
      },
    })

    expect(screen.getByTitle('1 issue').textContent).toBe('1')
  })

  it('moves a card dropped on the header of a collapsed column', async () => {
    const onMoveCard = vi.fn()
    const { container } = render(Board, {
      props: { ...props(), columns: columnsWithCard, collapsedLabels: new Set(['']), onMoveCard },
    })

    const cardWrapper = screen.getByText('Fix the thing').closest('[draggable]') as HTMLElement
    const otherHeader = container.querySelectorAll('.issues-column')[1].children[0] as HTMLElement

    const dt = fakeDataTransfer()
    await fireEvent(cardWrapper, dragEvent('dragstart', dt))
    await fireEvent(otherHeader, dragEvent('dragover', dt))
    expect(otherHeader.className).toContain('outline-primary')
    await fireEvent(otherHeader, dragEvent('drop', dt))

    expect(onMoveCard).toHaveBeenCalledWith(1, 'bug', '')
    expect(otherHeader.className).not.toContain('outline-primary')
  })
})

describe('Board card value chip', () => {
  it('shows a placeholder chip for a card with no value', () => {
    render(Board, { props: { ...props(), columns: columnsWithCard } })

    expect(screen.getByRole('button', { name: 'Set value' }).textContent).toBe('+')
  })

  it('shows the current value on the chip', () => {
    const columns: BoardColumn[] = [
      { label: 'bug', isOther: false, title: 'bug', color: null, cards: [{ ...bugCard, value: 7 }] },
    ]
    render(Board, { props: { ...props(), columns } })

    expect(screen.getByRole('button', { name: 'Value: 7. Click to change.' }).textContent).toBe('7')
  })

  it('opens a picker on click and reports the picked value without opening the card', async () => {
    const onCardClick = vi.fn()
    const onSetValue = vi.fn()
    render(Board, { props: { ...props(), columns: columnsWithCard, onCardClick, onSetValue } })

    await fireEvent.click(screen.getByRole('button', { name: 'Set value' }))
    await fireEvent.click(screen.getByRole('option', { name: 'Set value 6' }))

    expect(onSetValue).toHaveBeenCalledWith(1, 6)
    expect(onCardClick).not.toHaveBeenCalled()
    expect(screen.queryByRole('listbox', { name: 'Set value' })).toBeNull()
  })

  it('clears the value from the picker', async () => {
    const columns: BoardColumn[] = [
      { label: 'bug', isOther: false, title: 'bug', color: null, cards: [{ ...bugCard, value: 7 }] },
    ]
    const onSetValue = vi.fn()
    render(Board, { props: { ...props(), columns, onSetValue } })

    await fireEvent.click(screen.getByRole('button', { name: 'Value: 7. Click to change.' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Clear' }))

    expect(onSetValue).toHaveBeenCalledWith(1, null)
  })
})

describe('Board linked-task chip', () => {
  it('opens the linked task without opening the issue card', async () => {
    const onCardClick = vi.fn()
    const onOpenTask = vi.fn()
    const columns: BoardColumn[] = [
      {
        label: 'bug',
        isOther: false,
        title: 'bug',
        color: null,
        cards: [
          {
            ...bugCard,
            taskLink: {
              taskId: 'KVG-9',
              sessionId: 'session-9',
              workspacePath: '/tmp/kvg-9',
              repo: 'octo/cat',
              title: 'Fix the thing',
            },
          },
        ],
      },
    ]
    render(Board, { props: { ...props(), columns, onCardClick, onOpenTask } })

    await fireEvent.click(screen.getByRole('button', { name: 'Open OpenForge task KVG-9: Fix the thing' }))

    expect(onOpenTask).toHaveBeenCalledWith('KVG-9')
    expect(onCardClick).not.toHaveBeenCalled()
  })
})

describe('Board sub-issues', () => {
  const parent: BoardCard = {
    ...bugCard,
    issueNumber: 35,
    title: "Add 'Blocked By' field to tasks",
    subIssuesSummary: { total: 2, completed: 0, percentCompleted: 0 },
    subIssues: [
      {
        ...emptyHierarchy(),
        issueNumber: 506,
        title: 'item a',
        body: null,
        labels: ['bug'],
        value: null,
        taskLink: null,
        parentIssueNumber: 35,
      },
    ],
  }

  const nestedColumns: BoardColumn[] = [
    { label: 'bug', isOther: false, title: 'bug', color: null, cards: [parent] },
    { label: '', isOther: true, title: 'No label / Other', color: null, cards: [] },
  ]

  it('keeps nested sub-issues collapsed inside the parent card', () => {
    render(Board, { props: { ...props(), columns: nestedColumns } })

    expect(screen.getByText("Add 'Blocked By' field to tasks")).toBeTruthy()
    expect(screen.getByLabelText('0 of 2 sub-issues complete')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Show 1 sub-issue of #35' })).toBeTruthy()
    expect(screen.queryByRole('list', { name: 'Sub-issues of #35' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Issue #506: item a' })).toBeNull()
  })

  it('expands nested sub-issues inside the parent card and opens one', async () => {
    const onCardClick = vi.fn()
    render(Board, { props: { ...props(), onCardClick, columns: nestedColumns } })

    await fireEvent.click(screen.getByRole('button', { name: 'Show 1 sub-issue of #35' }))

    expect(screen.getByRole('button', { name: 'Hide 1 sub-issue of #35' })).toBeTruthy()
    expect(screen.getByRole('list', { name: 'Sub-issues of #35' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Issue #506: item a' })).toBeTruthy()

    await fireEvent.click(screen.getByRole('button', { name: 'Issue #506: item a' }))

    expect(onCardClick).toHaveBeenCalledWith(
      expect.objectContaining({ issueNumber: 506, title: 'item a' }),
      expect.objectContaining({ label: 'bug' }),
    )
  })

  it('expands nested sub-issues while a search is active so matches stay visible', () => {
    render(Board, { props: { ...props(), columns: nestedColumns, terms: ['item'] } })

    expect(screen.getByRole('button', { name: 'Hide 1 sub-issue of #35' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Issue #506: item a' })).toBeTruthy()
  })
})

describe('Board dependency arrows', () => {
  function box(left: number, top: number, width: number, height: number): DOMRect {
    return {
      x: left,
      y: top,
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      toJSON: () => ({}),
    } as DOMRect
  }

  it('draws a rounded arrow from the blocking issue to the blocked issue', async () => {
    const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.dataset.issueNumber === '12') return box(0, 0, 120, 48)
      if (this.dataset.issueNumber === '10') return box(360, 30, 120, 48)
      return box(0, 0, 800, 500)
    })
    const blocked: BoardCard = {
      ...bugCard,
      issueNumber: 10,
      title: 'Waiting',
      labels: ['feature'],
      blockedBy: [
        {
          number: 12,
          title: 'Schema',
          htmlUrl: 'https://github.com/octo/cat/issues/12',
          state: 'open',
          repo: 'octo/cat',
        },
      ],
      blockedByOpenCount: 1,
    }
    const blocker: BoardCard = {
      ...bugCard,
      issueNumber: 12,
      title: 'Schema',
      blocking: [
        {
          number: 10,
          title: 'Waiting',
          htmlUrl: 'https://github.com/octo/cat/issues/10',
          state: 'open',
          repo: 'octo/cat',
        },
      ],
      blockingOpenCount: 1,
    }
    const onCardClick = vi.fn()
    const { container } = render(Board, {
      props: {
        ...props(),
        onCardClick,
        columns: [
          { label: 'bug', isOther: false, title: 'bug', color: null, cards: [blocker] },
          { label: 'feature', isOther: false, title: 'feature', color: null, cards: [blocked] },
        ],
      },
    })

    const arrow = container.querySelector('.dep-arrow')
    expect(arrow?.getAttribute('d')).toContain('C ')
    expect(arrow?.getAttribute('marker-end')).toContain('issues-dep-arrow')

    await fireEvent.click(screen.getByRole('button', { name: 'Show #12 Schema, which blocks this issue' }))

    expect(onCardClick).not.toHaveBeenCalled()
    expect(container.querySelector('[data-issue-number="12"]')?.classList.contains('issues-dep-focus')).toBe(true)
    expect(arrow?.classList.contains('is-active')).toBe(true)
    spy.mockRestore()
  })
})
