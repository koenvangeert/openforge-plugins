// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/svelte'
import { beforeEach, describe, expect, it } from 'vitest'
import type { FrontendOpenForgeAPI } from '@openforge-app/plugin-sdk/frontend'
import { clearIssuesFilterSession } from '../lib/filterSession'
import type { IssueDependency, IssuesBoard } from '../lib/types'
import IssuesView from './IssuesView.svelte'
import { createIssuesViewApi } from './IssuesView.testUtils'

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
    issue(10, 'Plain'),
    issue(11, 'Started'),
    issue(12, 'Waiting', {
      blocked_by: [dependency(99, 'Blocker')],
      blocked_by_open_count: 1,
    }),
    issue(13, 'Ready valued'),
  ],
  labels: [bug],
  values: { '12': 3, '13': 3 },
  columnLabels: ['bug'],
}

function taskLink(taskId: string) {
  return {
    taskId,
    sessionId: `session-${taskId}`,
    workspacePath: `/tmp/${taskId}`,
    repo: 'octo/cat',
    title: 'Linked',
  }
}

function renderBoard(projectId = 'proj-1') {
  const { api } = createIssuesViewApi({ issues_get_board: async () => board })
  api.storage = {
    project: () => ({
      get: async (key: string) => (key === 'issueTaskLinks' ? { 11: taskLink('T-11') } : null),
      set: async () => undefined,
      delete: async () => undefined,
    }),
  } as unknown as FrontendOpenForgeAPI['storage']
  api.tasks = {
    active: async () => ({ tasks: [{ id: 'T-11' }], related: [] }),
  } as unknown as FrontendOpenForgeAPI['tasks']
  return { api, ...render(IssuesView, { props: { api, projectId, projectName: 'Cat' } }) }
}

async function chooseNoTaskUnblockedAndValue3(): Promise<void> {
  await fireEvent.click(screen.getByRole('radio', { name: 'Issues without an OpenForge task' }))
  await fireEvent.click(screen.getByRole('radio', { name: 'Show issues that are not blocked' }))
  await fireEvent.click(screen.getByRole('button', { name: 'Filter by value 3' }))
}

describe('IssuesView filter session', () => {
  beforeEach(() => {
    clearIssuesFilterSession()
  })

  it('keeps No task, Unblocked, and the value chip when the page opens again', async () => {
    const first = renderBoard()
    expect(await screen.findByText('Plain')).toBeTruthy()
    await chooseNoTaskUnblockedAndValue3()

    expect(screen.queryByText('Plain')).toBeNull()
    expect(screen.queryByText('Started')).toBeNull()
    expect(screen.queryByText('Waiting')).toBeNull()
    expect(screen.getByText('Ready valued')).toBeTruthy()

    first.unmount()
    renderBoard()

    expect(await screen.findByText('Ready valued')).toBeTruthy()
    expect(screen.queryByText('Plain')).toBeNull()
    expect(screen.queryByText('Started')).toBeNull()
    expect(screen.queryByText('Waiting')).toBeNull()
    expect(
      screen.getByRole('radio', { name: 'Issues without an OpenForge task' }).getAttribute('aria-checked'),
    ).toBe('true')
    expect(
      screen.getByRole('radio', { name: 'Show issues that are not blocked' }).getAttribute('aria-checked'),
    ).toBe('true')
    expect(screen.getByRole('button', { name: 'Filter by value 3' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('keeps a separate selection for each project', async () => {
    const { api, rerender } = renderBoard('proj-1')
    expect(await screen.findByText('Plain')).toBeTruthy()
    await fireEvent.click(screen.getByRole('radio', { name: 'Issues without an OpenForge task' }))
    expect(screen.queryByText('Started')).toBeNull()

    await rerender({ api, projectId: 'proj-2', projectName: 'Dog' })

    expect(await screen.findByText('Started')).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'All issues' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('radio', { name: 'Show all issues' }).getAttribute('aria-checked')).toBe('true')

    await fireEvent.click(screen.getByRole('radio', { name: 'Show issues that are not blocked' }))
    expect(screen.queryByText('Waiting')).toBeNull()

    await rerender({ api, projectId: 'proj-1', projectName: 'Cat' })

    expect(await screen.findByText('Plain')).toBeTruthy()
    expect(screen.queryByText('Started')).toBeNull()
    expect(screen.getByText('Waiting')).toBeTruthy()
    expect(
      screen.getByRole('radio', { name: 'Issues without an OpenForge task' }).getAttribute('aria-checked'),
    ).toBe('true')
    expect(screen.getByRole('radio', { name: 'Show all issues' }).getAttribute('aria-checked')).toBe('true')

    await rerender({ api, projectId: 'proj-2', projectName: 'Dog' })

    expect(await screen.findByText('Started')).toBeTruthy()
    expect(screen.queryByText('Waiting')).toBeNull()
    expect(screen.getByRole('radio', { name: 'All issues' }).getAttribute('aria-checked')).toBe('true')
    expect(
      screen.getByRole('radio', { name: 'Show issues that are not blocked' }).getAttribute('aria-checked'),
    ).toBe('true')
  })
})
