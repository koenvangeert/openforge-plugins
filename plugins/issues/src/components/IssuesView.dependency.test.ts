// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/svelte'
import { describe, expect, it } from 'vitest'
import IssuesView from './IssuesView.svelte'
import { createIssuesViewApi } from './IssuesView.testUtils'
import type { IssueDependency, IssuesBoard } from '../lib/types'

const bug = { name: 'bug', color: 'd73a4a' }

function dependency(number: number, title: string): IssueDependency {
  return {
    number,
    title,
    html_url: `https://github.com/octo/cat/issues/${number}`,
    state: 'open',
    repo: 'octo/cat',
  }
}

function issue(number: number, title: string, extra: Partial<IssuesBoard['issues'][number]> = {}) {
  return {
    number,
    title,
    body: null,
    state: 'open',
    html_url: `https://github.com/octo/cat/issues/${number}`,
    labels: [bug],
    ...extra,
  }
}

const board: IssuesBoard = {
  repo: { owner: 'octo', name: 'cat' },
  issues: [
    issue(10, 'Waiting on the schema', {
      blocked_by: [dependency(12, 'Schema')],
      blocked_by_open_count: 1,
    }),
    issue(11, 'Ready to start'),
    issue(12, 'Schema', {
      blocking: [dependency(10, 'Waiting on the schema')],
      blocking_open_count: 1,
    }),
  ],
  labels: [bug],
  values: {},
  columnLabels: ['bug'],
}

function renderBoard() {
  const { api } = createIssuesViewApi({ issues_get_board: async () => board })
  render(IssuesView, { props: { api, projectId: 'proj-1', projectName: 'Cat' } })
}

describe('IssuesView dependency filter', () => {
  it('switches between all issues, blocked issues, and issues that are not blocked', async () => {
    renderBoard()

    expect(await screen.findByText('Waiting on the schema')).toBeTruthy()
    expect(screen.getByText('Ready to start')).toBeTruthy()
    expect(screen.getByText('Schema')).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Show all issues' }).getAttribute('aria-checked')).toBe('true')

    await fireEvent.click(screen.getByRole('radio', { name: 'Show blocked issues' }))

    expect(screen.getByText('Waiting on the schema')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Show #12 Schema, which blocks this issue' })).toBeTruthy()
    expect(screen.queryByText('Ready to start')).toBeNull()
    expect(screen.queryByText('Schema')).toBeNull()

    await fireEvent.click(screen.getByRole('radio', { name: 'Show issues that are not blocked' }))

    expect(screen.queryByText('Waiting on the schema')).toBeNull()
    expect(screen.getByText('Ready to start')).toBeTruthy()
    expect(screen.getByText('Schema')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Show #10 Waiting on the schema, which this issue blocks' })).toBeTruthy()

    await fireEvent.click(screen.getByRole('radio', { name: 'Show blocking issues' }))

    expect(screen.getByText('Schema')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Show #10 Waiting on the schema, which this issue blocks' })).toBeTruthy()
    expect(screen.queryByText('Waiting on the schema')).toBeNull()
    expect(screen.queryByText('Ready to start')).toBeNull()

    await fireEvent.click(screen.getByRole('radio', { name: 'Show all issues' }))

    expect(screen.getByText('Waiting on the schema')).toBeTruthy()
    expect(screen.getByText('Schema')).toBeTruthy()
  })

  it('offers a way back when no issue is blocked', async () => {
    const { api } = createIssuesViewApi({
      issues_get_board: async () => ({ ...board, issues: [issue(11, 'Ready to start')] }),
    })
    render(IssuesView, { props: { api, projectId: 'proj-1', projectName: 'Cat' } })
    await screen.findByText('Ready to start')

    await fireEvent.click(screen.getByRole('radio', { name: 'Show blocked issues' }))

    expect(await screen.findByText('No issue is blocked by another issue.')).toBeTruthy()

    await fireEvent.click(screen.getByRole('radio', { name: 'Show blocking issues' }))

    expect(await screen.findByText('No issue blocks another issue.')).toBeTruthy()
    await fireEvent.click(screen.getByRole('button', { name: 'Show all' }))

    expect(await screen.findByText('Ready to start')).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Show all issues' }).getAttribute('aria-checked')).toBe('true')
  })
})
