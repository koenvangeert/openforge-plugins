// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/svelte'
import { describe, expect, it } from 'vitest'
import IssuesView from './IssuesView.svelte'
import { createIssuesViewApi } from './IssuesView.testUtils'
import type { FrontendOpenForgeAPI } from '@openforge-app/plugin-sdk/frontend'
import type { IssuesBoard } from '../lib/types'

const bug = { name: 'bug', color: 'd73a4a' }

function issue(number: number, title: string) {
  return {
    number,
    title,
    body: null,
    state: 'open',
    html_url: `https://github.com/octo/cat/issues/${number}`,
    labels: [bug],
  }
}

const board: IssuesBoard = {
  repo: { owner: 'octo', name: 'cat' },
  issues: [issue(10, 'Still open'), issue(11, 'Already started')],
  labels: [bug],
  values: {},
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

function renderBoard(links: Record<number, ReturnType<typeof taskLink>>) {
  const { api } = createIssuesViewApi({ issues_get_board: async () => board })
  // The board load only reads project task links and the live task list.
  api.storage = {
    project: () => ({
      get: async (key: string) => (key === 'issueTaskLinks' ? links : null),
      set: async () => undefined,
      delete: async () => undefined,
    }),
  } as unknown as FrontendOpenForgeAPI['storage']
  api.tasks = {
    active: async () => ({
      tasks: Object.values(links).map((link) => ({ id: link.taskId })),
      related: [],
    }),
  } as unknown as FrontendOpenForgeAPI['tasks']
  render(IssuesView, { props: { api, projectId: 'proj-1', projectName: 'Cat' } })
}

describe('IssuesView task filter', () => {
  it('switches between all issues, issues with no task, and issues with a task', async () => {
    renderBoard({ 11: taskLink('T-11') })

    expect(await screen.findByText('#10')).toBeTruthy()
    expect(screen.getByText('#11')).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'All issues' }).getAttribute('aria-checked')).toBe('true')

    await fireEvent.click(screen.getByRole('radio', { name: 'Issues without an OpenForge task' }))

    expect(screen.queryByText('#11')).toBeNull()
    expect(screen.getByText('#10')).toBeTruthy()

    await fireEvent.click(screen.getByRole('radio', { name: 'Issues with an OpenForge task' }))

    expect(screen.queryByText('#10')).toBeNull()
    expect(screen.getByText('#11')).toBeTruthy()

    await fireEvent.click(screen.getByRole('radio', { name: 'All issues' }))

    expect(screen.getByText('#10')).toBeTruthy()
    expect(screen.getByText('#11')).toBeTruthy()
  })

  it('offers a way back when the chosen side is empty', async () => {
    renderBoard({ 10: taskLink('T-10'), 11: taskLink('T-11') })
    await screen.findByText('#10')

    await fireEvent.click(screen.getByRole('radio', { name: 'Issues without an OpenForge task' }))

    expect(await screen.findByText('Every issue already has an OpenForge task.')).toBeTruthy()
    expect(screen.queryByText('#10')).toBeNull()

    await fireEvent.click(screen.getByRole('button', { name: 'Show all' }))

    expect(await screen.findByText('#10')).toBeTruthy()
    expect(screen.getByText('#11')).toBeTruthy()
  })
})
