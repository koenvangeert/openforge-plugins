// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderIssuesView } from './IssuesView.testUtils'
import type { IssuesBoard } from '../lib/types'

const bug = { name: 'bug', color: 'd73a4a' }
const feature = { name: 'feature', color: '0e8a16' }

function issue(
  number: number,
  title: string,
  extra: Partial<IssuesBoard['issues'][number]> = {},
) {
  return {
    number,
    title,
    body: '',
    state: 'open',
    html_url: `https://github.com/octo/cat/issues/${number}`,
    labels: [bug],
    ...extra,
  }
}

const board: IssuesBoard = {
  repo: { owner: 'octo', name: 'cat' },
  issues: [
    issue(35, "Add 'Blocked By' field to tasks", {
      sub_issues_summary: { total: 1, completed: 0, percent_completed: 0 },
    }),
    issue(506, 'item a', {
      parent_issue_url: 'https://api.github.com/repos/octo/cat/issues/35',
    }),
    issue(11, 'Unrelated crash'),
  ],
  labels: [bug],
  values: {},
  columnLabels: ['bug'],
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('IssuesView sub-issue grouping', () => {
  it('renders a parent with nested sub-issues collapsed', async () => {
    renderIssuesView({ issues_get_board: async () => board })

    await screen.findByText("Add 'Blocked By' field to tasks")

    expect(screen.getByLabelText('0 of 1 sub-issues complete')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Show 1 sub-issue of #35' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Issue #506: item a' })).toBeNull()
    expect(screen.getByText('Unrelated crash')).toBeTruthy()
  })

  it('opens the nested sub-issue after expanding the parent', async () => {
    renderIssuesView({ issues_get_board: async () => board })

    await fireEvent.click(await screen.findByRole('button', { name: 'Show 1 sub-issue of #35' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Issue #506: item a' }))

    expect(await screen.findByRole('dialog', { name: 'Issue #506' })).toBeTruthy()
    expect(screen.getByText('Parent issue #35')).toBeTruthy()
  })

  it('shows a differently labelled sub-issue in its own column with a parent hint', async () => {
    const mixed: IssuesBoard = {
      repo: { owner: 'octo', name: 'cat' },
      issues: [
        issue(491, '[Agents] Roadmap', {
          labels: [feature],
          sub_issues_summary: { total: 2, completed: 0, percent_completed: 0 },
        }),
        issue(490, 'CLI tool', {
          labels: [feature],
          parent_issue_url: 'https://api.github.com/repos/octo/cat/issues/491',
        }),
        issue(12, 'Crash on save', {
          labels: [bug],
          parent_issue_url: 'https://api.github.com/repos/octo/cat/issues/491',
        }),
      ],
      labels: [feature, bug],
      values: {},
      columnLabels: ['feature', 'bug'],
    }

    renderIssuesView({ issues_get_board: async () => mixed })

    expect(await screen.findByText('[Agents] Roadmap')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Show 1 sub-issue of #491' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Issue #490: CLI tool' })).toBeNull()
    expect(screen.getByText('Crash on save')).toBeTruthy()
    expect(screen.getByText('Parent #491')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Issue #12: Crash on save' })).toBeNull()

    await fireEvent.click(screen.getByRole('button', { name: 'Show 1 sub-issue of #491' }))

    expect(screen.getByRole('button', { name: 'Issue #490: CLI tool' })).toBeTruthy()
  })
})
