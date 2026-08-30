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

function renderCard(overrides: Partial<BoardCard> = {}, onOpen = vi.fn(), onOpenUrl = vi.fn()) {
  render(Card, {
    props: {
      card: { ...card, ...overrides },
      repo: 'octo/cat',
      onOpen,
      onOpenUrl,
      onCopyLink: vi.fn(),
      onSetValue: vi.fn(),
      onContextMenu: vi.fn(),
    },
  })
  return { onOpen, onOpenUrl }
}

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

    expect(screen.getByText('KVG-9')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open pull request #99: Fix hydrate' })).toBeTruthy()
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
        onCopyLink: vi.fn(),
        onSetValue: vi.fn(),
        onContextMenu: vi.fn(),
        expanded: true,
        onToggleExpand: vi.fn(),
        onOpenChild: vi.fn(),
        onChildContextMenu: vi.fn(),
        isExpanded: () => true,
      },
    })

    await fireEvent.click(screen.getByRole('link', { name: 'Open pull request #88: Child PR' }))

    expect(onOpenUrl).toHaveBeenCalledWith('https://github.com/octo/cat/pull/88')
  })
})
