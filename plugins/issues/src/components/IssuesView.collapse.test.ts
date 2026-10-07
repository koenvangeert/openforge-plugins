// @vitest-environment jsdom
import { createMemoryPluginStorage } from '@openforge-app/plugin-sdk/testing'
import { fireEvent, screen, waitFor, within } from '@testing-library/svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderIssuesView } from './IssuesView.testUtils'
import type { IssuesBoard } from '../lib/types'

const bug = { name: 'bug', color: 'd73a4a' }
const docs = { name: 'docs', color: '0075ca' }

function issue(number: number, title: string, label: typeof bug) {
  return {
    number,
    title,
    body: null,
    state: 'open',
    html_url: `https://github.com/octo/cat/issues/${number}`,
    labels: [label],
  }
}

const board: IssuesBoard = {
  repo: { owner: 'octo', name: 'cat' },
  issues: [
    issue(10, 'Refresh token expiry', bug),
    issue(11, 'Unrelated crash on save', bug),
    issue(12, 'auth retry loops', bug),
    issue(20, 'auth docs are stale', docs),
  ],
  labels: [bug, docs],
  values: {},
  columnLabels: ['bug', 'docs'],
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('IssuesView column collapse', () => {
  it('keeps a collapsed column collapsed when the board opens again', async () => {
    const storage = createMemoryPluginStorage()
    const first = renderIssuesView({ issues_get_board: async () => board }, storage)

    await fireEvent.click(await screen.findByRole('button', { name: 'Collapse bug' }))

    expect(screen.queryByText('#10')).toBeNull()
    expect(screen.getByText('#20')).toBeTruthy()
    await waitFor(async () =>
      expect(await storage.project('proj-1').get('collapsedColumns')).toEqual(['bug']),
    )

    first.unmount()
    renderIssuesView({ issues_get_board: async () => board }, storage)

    expect(await screen.findByRole('button', { name: 'Expand bug' })).toBeTruthy()
    expect(await screen.findByText('#20')).toBeTruthy()
    expect(screen.queryByText('#10')).toBeNull()
  })

  it('counts the filtered issues of a collapsed column', async () => {
    const storage = createMemoryPluginStorage()
    await storage.project('proj-1').set('collapsedColumns', ['bug'])
    renderIssuesView({ issues_get_board: async () => board }, storage)

    const bugColumn = () =>
      within(screen.getByRole('button', { name: 'Expand bug' }).closest('.issues-column') as HTMLElement)
    await screen.findByRole('button', { name: 'Expand bug' })
    expect(bugColumn().getByTitle('3 issues').textContent).toBe('3')

    await fireEvent.input(screen.getByLabelText('Search issues'), { target: { value: 'auth' } })

    // Only #12 matches in bug; #20 matches in docs.
    await waitFor(() => expect(bugColumn().getByTitle('1 issue').textContent).toBe('1'))
    expect(bugColumn().queryByText('#12')).toBeNull()
  })
})
