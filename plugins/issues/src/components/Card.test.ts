// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'
import Card from './Card.svelte'
import { emptyHierarchy, type BoardCard } from '../lib/board'

const card: BoardCard = {
  issueNumber: 1,
  title: 'Fix the thing',
  body: null,
  labels: ['bug'],
  value: null,
  taskLink: null,
  ...emptyHierarchy(),
}

function renderCard(
  overrides: Partial<BoardCard> = {},
  onOpen = vi.fn(),
  onOpenUrl = vi.fn(),
  onOpenTask = vi.fn(),
  onCopyLink = vi.fn(),
  onStart = vi.fn(),
) {
  render(Card, {
    props: {
      card: { ...card, ...overrides },
      repo: 'octo/cat',
      onOpen,
      onOpenUrl,
      onOpenTask,
      onCopyLink,
      onSetValue: vi.fn(),
      onStart,
    },
  })
  return { onOpen, onOpenUrl, onOpenTask, onCopyLink, onStart }
}

describe('Card issue actions', () => {
  it('opens the issue on GitHub without opening the card', async () => {
    const { onOpen, onOpenUrl } = renderCard()

    await fireEvent.click(screen.getByRole('button', { name: 'Open issue on GitHub' }))

    expect(onOpenUrl).toHaveBeenCalledWith('https://github.com/octo/cat/issues/1')
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('copies the issue link without opening the card or the browser', async () => {
    const { onOpen, onOpenUrl, onCopyLink } = renderCard()

    await fireEvent.click(screen.getByRole('button', { name: 'Copy issue link' }))

    expect(onCopyLink).toHaveBeenCalledWith(1)
    expect(onOpenUrl).not.toHaveBeenCalled()
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('starts a task from the card without a menu', async () => {
    const { onOpen, onStart } = renderCard()

    expect(screen.queryByRole('button', { name: 'Issue actions' })).toBeNull()
    expect(screen.queryByRole('menu', { name: 'Issue actions' })).toBeNull()

    await fireEvent.click(screen.getByRole('button', { name: 'Start a task' }))

    expect(onStart).toHaveBeenCalledOnce()
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('disables start while the board is busy', () => {
    render(Card, {
      props: {
        card,
        repo: 'octo/cat',
        busy: true,
        onOpen: vi.fn(),
        onOpenUrl: vi.fn(),
        onOpenTask: vi.fn(),
        onCopyLink: vi.fn(),
        onSetValue: vi.fn(),
        onStart: vi.fn(),
      },
    })

    expect(screen.getByRole('button', { name: 'Start a task' })).toHaveProperty('disabled', true)
  })
})

describe('Card task and pull-request chips', () => {
  it('renders the task chip next to a linked pull request chip', () => {
    renderCard({
      taskLink: {
        taskId: 'KVG-9',
        sessionId: 'session-9',
        workspacePath: '/tmp/kvg-9',
        repo: 'octo/cat',
        title: 'Fix the thing',
      },
      linkedPullRequests: [
        {
          number: 99,
          title: 'Fix hydrate',
          htmlUrl: 'https://github.com/octo/cat/pull/99',
          state: 'open',
        },
      ],
    })

    expect(screen.getByRole('button', { name: 'Open OpenForge task KVG-9: Fix the thing' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open pull request #99: Fix hydrate' })).toBeTruthy()
  })

  it('opens the linked task without opening the issue card', async () => {
    const { onOpen, onOpenTask } = renderCard({
      taskLink: {
        taskId: 'KVG-9',
        sessionId: 'session-9',
        workspacePath: '/tmp/kvg-9',
        repo: 'octo/cat',
        title: 'Fix the thing',
      },
    })

    await fireEvent.click(screen.getByRole('button', { name: 'Open OpenForge task KVG-9: Fix the thing' }))

    expect(onOpenTask).toHaveBeenCalledWith('KVG-9')
    expect(onOpen).not.toHaveBeenCalled()
  })
})

describe('Card linked pull requests', () => {
  it('does not show a pull request link when the issue has none', () => {
    renderCard()

    expect(screen.queryByRole('link', { name: /pull request/i })).toBeNull()
  })

  it('shows a link to each linked pull request', () => {
    renderCard({
      linkedPullRequests: [
        {
          number: 99,
          title: 'Fix hydrate',
          htmlUrl: 'https://github.com/octo/cat/pull/99',
          state: 'open',
        },
        {
          number: 100,
          title: 'Also this',
          htmlUrl: 'https://github.com/octo/cat/pull/100',
          state: 'merged',
        },
      ],
    })

    expect(screen.getByRole('link', { name: 'Open pull request #99: Fix hydrate' })).toHaveProperty(
      'href',
      'https://github.com/octo/cat/pull/99',
    )
    expect(screen.getByRole('link', { name: 'Open pull request #100: Also this' })).toBeTruthy()
  })

  it('opens the pull request without opening the issue card', async () => {
    const { onOpen, onOpenUrl } = renderCard({
      linkedPullRequests: [
        {
          number: 99,
          title: 'Fix hydrate',
          htmlUrl: 'https://github.com/octo/cat/pull/99',
          state: 'open',
        },
      ],
    })

    await fireEvent.click(screen.getByRole('link', { name: 'Open pull request #99: Fix hydrate' }))

    expect(onOpenUrl).toHaveBeenCalledWith('https://github.com/octo/cat/pull/99')
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('shows a pull request link on a nested sub-issue', async () => {
    const onOpenUrl = vi.fn()
    render(Card, {
      props: {
        card: {
          ...card,
          issueNumber: 35,
          title: 'Parent',
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
              linkedPullRequests: [
                {
                  number: 88,
                  title: 'Child PR',
                  htmlUrl: 'https://github.com/octo/cat/pull/88',
                  state: 'open',
                },
              ],
            },
          ],
        },
        repo: 'octo/cat',
        onOpen: vi.fn(),
        onOpenUrl,
        onOpenTask: vi.fn(),
        onCopyLink: vi.fn(),
        onSetValue: vi.fn(),
        onStart: vi.fn(),
        expanded: true,
        onToggleExpand: vi.fn(),
        onOpenChild: vi.fn(),
        isExpanded: () => true,
      },
    })

    await fireEvent.click(screen.getByRole('link', { name: 'Open pull request #88: Child PR' }))

    expect(onOpenUrl).toHaveBeenCalledWith('https://github.com/octo/cat/pull/88')
  })
})
