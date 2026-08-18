// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderIssuesView } from './IssuesView.testUtils'
import type { IssuesBoard } from '../lib/types'

const bug = { name: 'bug', color: 'd73a4a' }

function issue(number: number, title: string, body: string | null = null) {
  return {
    number,
    title,
    body,
    state: 'open',
    html_url: `https://github.com/octo/cat/issues/${number}`,
    labels: [bug],
  }
}

const board: IssuesBoard = {
  repo: { owner: 'octo', name: 'cat' },
  issues: [
    issue(10, 'Refresh token expiry', 'Retry the auth handshake before it expires.'),
    issue(11, 'Unrelated crash on save'),
    issue(12, 'auth docs are stale'),
  ],
  labels: [bug],
  values: {},
  columnLabels: ['bug'],
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('IssuesView search', () => {
  it('filters the board to matching cards and shows a match count', async () => {
    renderIssuesView({ issues_get_board: async () => board })

    await screen.findByText('#10')
    await fireEvent.input(screen.getByLabelText('Search issues'), { target: { value: 'auth' } })

    await waitFor(() => {
      expect(screen.queryByText('#11')).toBeNull()
    })
    expect(screen.getByText('#10')).toBeTruthy()
    expect(screen.getByText('#12')).toBeTruthy()
    expect(screen.getByText('2 of 3')).toBeTruthy()
  })

  it('shows a no-match state with a working Clear button when nothing matches', async () => {
    renderIssuesView({ issues_get_board: async () => board })

    await screen.findByText('#10')
    await fireEvent.input(screen.getByLabelText('Search issues'), { target: { value: 'nonexistent' } })

    expect(await screen.findByText('No issues match "nonexistent".')).toBeTruthy()
    expect(screen.queryByText('#10')).toBeNull()

    await fireEvent.click(screen.getByRole('button', { name: 'Clear' }))

    expect(await screen.findByText('#10')).toBeTruthy()
    expect(screen.queryByText(/No issues match/)).toBeNull()
  })

  it('"/" focuses the search input from outside any field', async () => {
    renderIssuesView({ issues_get_board: async () => board })
    await screen.findByText('#10')

    const input = screen.getByLabelText('Search issues') as HTMLInputElement
    expect(document.activeElement).not.toBe(input)

    await fireEvent.keyDown(window, { key: '/' })

    expect(document.activeElement).toBe(input)
  })

  it('Esc clears an active query while search is focused', async () => {
    renderIssuesView({ issues_get_board: async () => board })
    await screen.findByText('#10')

    const input = screen.getByLabelText('Search issues') as HTMLInputElement
    input.focus()
    await fireEvent.input(input, { target: { value: 'auth' } })
    expect(input.value).toBe('auth')

    await fireEvent.keyDown(input, { key: 'Escape' })

    expect(input.value).toBe('')
  })

  it('resets the query when the active project changes', async () => {
    const { api, rerender } = renderIssuesView({ issues_get_board: async () => board })
    await screen.findByText('#10')

    await fireEvent.input(screen.getByLabelText('Search issues'), { target: { value: 'auth' } })
    expect((screen.getByLabelText('Search issues') as HTMLInputElement).value).toBe('auth')

    await rerender({ api, projectId: 'proj-2', projectName: 'Other' })

    expect((screen.getByLabelText('Search issues') as HTMLInputElement).value).toBe('')
  })

  it('a board reload that removes the matching issue clears the filtered view too', async () => {
    // "stale" uniquely matches #12. Closing it triggers IssuesView's own reload,
    // which this stub represents by dropping #12 from the next board response —
    // the filtered view must pick that up through the same reactive board getter.
    let closed = false
    const boardWithout12: IssuesBoard = { ...board, issues: board.issues.slice(0, 2) }
    renderIssuesView({
      issues_get_board: async () => (closed ? boardWithout12 : board),
      issues_edit_issue: async () => {
        closed = true
        return null
      },
    })
    await screen.findByText('#10')

    await fireEvent.input(screen.getByLabelText('Search issues'), { target: { value: 'stale' } })
    await waitFor(() => expect(screen.getByText('#12')).toBeTruthy())

    // The title is split across highlight spans, so click on the (unhighlighted)
    // issue number instead — the click still bubbles up to the card's own handler.
    await fireEvent.click(screen.getByText('#12'))
    await fireEvent.click(await screen.findByRole('button', { name: 'Close issue' }))

    expect(await screen.findByText('No issues match "stale".')).toBeTruthy()
  })
})
