// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import type { FrontendOpenForgeAPI } from '@openforge-app/plugin-sdk/frontend'
import type { Task } from '@openforge-app/plugin-sdk/domain'
import { createOpenForgeRegistryFake } from '@openforge-app/plugin-sdk/testing'
import { describe, expect, it, vi } from 'vitest'
import type { IssueResult, JiraIssue } from '../lib/jiraTypes'
import { TASK_KEY } from '../lib/protocol'
import LinkedIssueSection from './LinkedIssueSection.svelte'

const TASK_ID = 'KVG-1495'

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: TASK_ID,
    initial_prompt: '',
    status: 'doing',
    prompt: null,
    title: null,
    title_source: null,
    title_generated_at: null,
    summary: null,
    agent: null,
    permission_mode: null,
    worktree_source: null,
    worktree_branch: null,
    handoff_notes_enabled: true,
    source_ticket_url: null,
    depends_on: [],
    project_id: 'P-1',
    created_at: 0,
    updated_at: 0,
    ...overrides,
  }
}

function makeIssue(overrides: Partial<JiraIssue> = {}): JiraIssue {
  return {
    key: 'PROJ-7',
    summary: 'Keep the section compact',
    status: 'In Progress',
    priority: null,
    issueType: 'Task',
    assignee: null,
    updated: null,
    descriptionHtml: '<p>A short, useful description.</p>',
    url: 'https://acme.atlassian.net/browse/PROJ-7',
    ...overrides,
  }
}

function makeHarness(options: { task?: Task; results?: IssueResult[] } = {}) {
  const registry = createOpenForgeRegistryFake({ pluginId: 'dev.kvg.jira', projectId: 'P-1' })
  const results = [...(options.results ?? [{ ok: true, issue: makeIssue() }])]
  const invoke = vi.fn(async () => results.shift() ?? { ok: true, issue: makeIssue() })
  const openUrl = vi.fn(async () => undefined)
  const api: FrontendOpenForgeAPI = {
    ...registry.frontendApi,
    backend: {
      state: 'ready',
      whenReady: async () => undefined,
      onReady: () => ({ dispose: () => undefined }),
      invoke: invoke as FrontendOpenForgeAPI['backend']['invoke'],
    },
    tasks: {
      ...registry.frontendApi.tasks,
      get: async () => options.task ?? makeTask(),
    },
    system: { openUrl },
  }

  return { api, invoke, openUrl, registry }
}

function renderSection(api: FrontendOpenForgeAPI, taskId = TASK_ID) {
  return render(LinkedIssueSection, {
    props: {
      api,
      context: api.context.getSnapshot(),
      taskId,
      projectId: 'P-1',
    },
  })
}

describe('LinkedIssueSection', () => {
  it('shows the compact unlinked state for a Task without an Issue Link', async () => {
    const { api, invoke } = makeHarness()

    renderSection(api)

    expect(await screen.findByText("This Task isn't linked to a Jira Issue.")).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Link Issue' })).toBeTruthy()
    expect(invoke).not.toHaveBeenCalled()
  })

  it('offers a Task-text key hint but links it only after user confirmation', async () => {
    const { api, invoke, registry } = makeHarness({
      task: makeTask({ initial_prompt: 'Investigate the behavior described in PROJ-7.' }),
    })

    renderSection(api)

    const input = await screen.findByLabelText('Issue Key') as HTMLInputElement
    await waitFor(() => expect(input.value).toBe('PROJ-7'))
    expect(screen.getByText(/Suggested from Task text/).textContent).toContain('PROJ-7')
    await expect(registry.storage.task(TASK_ID).get(TASK_KEY.link)).resolves.toBeNull()
    expect(invoke).not.toHaveBeenCalled()

    await fireEvent.click(screen.getByRole('button', { name: 'Link Issue' }))

    expect(await screen.findByText('Keep the section compact')).toBeTruthy()
    await expect(registry.storage.task(TASK_ID).get(TASK_KEY.link)).resolves.toEqual({ key: 'PROJ-7' })
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('renders linked context, refreshes on open and only refreshes again on demand', async () => {
    const first = makeIssue()
    const second = makeIssue({ summary: 'Fresh Jira context', status: 'Done' })
    const { api, invoke, openUrl, registry } = makeHarness({
      results: [{ ok: true, issue: first }, { ok: true, issue: second }],
    })
    await registry.storage.task(TASK_ID).set(TASK_KEY.link, { key: first.key })

    renderSection(api)

    expect(await screen.findByText(first.summary)).toBeTruthy()
    expect(screen.getByText(first.status)).toBeTruthy()
    expect(screen.getByText('A short, useful description.')).toBeTruthy()
    expect(screen.getByText(/Last refreshed/)).toBeTruthy()
    expect(invoke).toHaveBeenCalledTimes(1)

    await fireEvent.click(screen.getByRole('button', { name: 'Open in Jira' }))
    expect(openUrl).toHaveBeenCalledWith(first.url)

    await fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(await screen.findByText(second.summary)).toBeTruthy()
    expect(invoke).toHaveBeenCalledTimes(2)

    await fireEvent.click(screen.getByRole('button', { name: 'Linked Issue' }))
    expect(invoke).toHaveBeenCalledTimes(2)
    await fireEvent.click(screen.getByRole('button', { name: 'Linked Issue' }))
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(3))
  })

  it('unlinks without mutating Jira and returns to the empty state', async () => {
    const issue = makeIssue()
    const { api, registry } = makeHarness({ results: [{ ok: true, issue }] })
    await registry.storage.task(TASK_ID).set(TASK_KEY.link, { key: issue.key })

    renderSection(api)
    await screen.findByText(issue.summary)
    await fireEvent.click(screen.getByRole('button', { name: 'Unlink' }))

    expect(await screen.findByText("This Task isn't linked to a Jira Issue.")).toBeTruthy()
    await expect(registry.storage.task(TASK_ID).get(TASK_KEY.link)).resolves.toBeNull()
    await expect(registry.storage.task(TASK_ID).get(TASK_KEY.cachedIssue)).resolves.toBeNull()
  })

  it('keeps the Issue Link visible when refresh fails and offers recovery actions', async () => {
    const { api, registry } = makeHarness({
      results: [{ ok: false, error: 'network', message: 'Jira is temporarily unavailable.' }],
    })
    await registry.storage.task(TASK_ID).set(TASK_KEY.link, { key: 'PROJ-7' })

    renderSection(api)

    expect((await screen.findByRole('alert')).textContent).toContain('Jira is temporarily unavailable.')
    expect(screen.getByText('PROJ-7')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Unlink' })).toBeTruthy()
  })

  it('reloads its Issue Link state when the host selects a different Task', async () => {
    const issue = makeIssue()
    const { api, registry } = makeHarness({ results: [{ ok: true, issue }] })
    await registry.storage.task(TASK_ID).set(TASK_KEY.link, { key: issue.key })
    const view = renderSection(api)
    await screen.findByText(issue.summary)

    await view.rerender({
      api,
      context: api.context.getSnapshot(),
      taskId: 'KVG-1496',
      projectId: 'P-1',
    })

    expect(await screen.findByText("This Task isn't linked to a Jira Issue.")).toBeTruthy()
    expect(screen.queryByText(issue.summary)).toBeNull()
  })
})
