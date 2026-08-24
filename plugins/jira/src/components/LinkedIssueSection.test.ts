// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import type { JsonValue } from '@openforge-app/plugin-sdk'
import type { FrontendOpenForgeAPI } from '@openforge-app/plugin-sdk/frontend'
import type { Task } from '@openforge-app/plugin-sdk/domain'
import { createOpenForgeRegistryFake } from '@openforge-app/plugin-sdk/testing'
import { describe, expect, it, vi } from 'vitest'
import type { IssueResult, JiraIssue } from '../lib/jiraTypes'
import { REFRESH_EVENT, TASK_KEY } from '../lib/protocol'
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
    agent: null,
    permission_mode: null,
    worktree_source: null,
    worktree_branch: null,
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

function makeHarness(options: { task?: Task; results?: IssueResult[]; respond?: () => Promise<IssueResult> } = {}) {
  const registry = createOpenForgeRegistryFake({ pluginId: 'dev.kvg.jira', projectId: 'P-1' })
  const results = [...(options.results ?? [{ ok: true, issue: makeIssue() }])]
  const invoke = vi.fn(async () =>
    options.respond ? await options.respond() : results.shift() ?? { ok: true, issue: makeIssue() },
  )
  const openUrl = vi.fn(async () => undefined)
  const writeClipboardText = vi.fn(async () => undefined)
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
    system: { openUrl, writeClipboardText },
  }

  return { api, invoke, openUrl, writeClipboardText, registry }
}

type Registry = ReturnType<typeof createOpenForgeRegistryFake>

/** JiraIssue carries no index signature, so JsonValue needs widening here. */
async function seedSnapshot(registry: Registry, taskId: string, issue: JiraIssue, refreshedAt: string): Promise<void> {
  await registry.storage.task(taskId).set(TASK_KEY.snapshot, { issue, refreshedAt } as unknown as JsonValue)
}

/** Let the in-flight background read finish so an absent alert means absent, not late. */
async function settled(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

function renderSection(api: FrontendOpenForgeAPI, taskId = TASK_ID) {
  return render(LinkedIssueSection, {
    props: {
      api,
      context: api.context.getSnapshot(),
      taskId,
      projectId: 'P-1',
      taskActionPending: false,
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

  it('renders linked context, reads Jira once on open and again only on demand', async () => {
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
    expect(await screen.findByText(second.summary)).toBeTruthy()
    expect(invoke).toHaveBeenCalledTimes(2)
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
    await expect(registry.storage.task(TASK_ID).get(TASK_KEY.snapshot)).resolves.toBeNull()
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

  it('paints a fresh Issue Snapshot on a Task switch without reading Jira', async () => {
    const first = makeIssue()
    const second = makeIssue({ key: 'PROJ-8', summary: 'The other linked Issue' })
    const { api, invoke, registry } = makeHarness()
    for (const [taskId, issue] of [[TASK_ID, first], ['KVG-1496', second]] as const) {
      await registry.storage.task(taskId).set(TASK_KEY.link, { key: issue.key })
      await seedSnapshot(registry, taskId, issue, new Date().toISOString())
    }

    const view = renderSection(api)
    expect(await screen.findByText(first.summary)).toBeTruthy()

    const content = view.container.querySelector('[aria-busy]') as HTMLElement
    const busyStates: (string | null)[] = []
    const observer = new MutationObserver(() => busyStates.push(content.getAttribute('aria-busy')))
    observer.observe(content, { attributes: true, attributeFilter: ['aria-busy'] })

    await view.rerender({ api, context: api.context.getSnapshot(), taskId: 'KVG-1496', projectId: 'P-1' })

    expect(await screen.findByText(second.summary)).toBeTruthy()
    await settled()
    observer.disconnect()

    expect(content.isConnected).toBe(true)
    expect(invoke).not.toHaveBeenCalled()
    expect(busyStates).toEqual([])
  })

  it('keeps a stale Issue Snapshot painted and silent when the background read fails', async () => {
    const issue = makeIssue()
    const { api, invoke, registry } = makeHarness({
      results: [{ ok: false, error: 'network', message: 'Jira is temporarily unavailable.' }],
    })
    await registry.storage.task(TASK_ID).set(TASK_KEY.link, { key: issue.key })
    const refreshedAt = new Date(Date.now() - 600_000)
    await seedSnapshot(registry, TASK_ID, issue, refreshedAt.toISOString())

    renderSection(api)

    expect(await screen.findByText(issue.summary)).toBeTruthy()
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1))
    await settled()

    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText(issue.summary)).toBeTruthy()
    expect(screen.getByText(`Last refreshed ${refreshedAt.toLocaleString()}`)).toBeTruthy()
  })

  it('reads Jira through a fresh Snapshot when the plugin Refresh command fires', async () => {
    const cached = makeIssue()
    const fetched = makeIssue({ summary: 'Fresh Jira context', status: 'Done' })
    const { api, invoke, registry } = makeHarness({ results: [{ ok: true, issue: fetched }] })
    await registry.storage.task(TASK_ID).set(TASK_KEY.link, { key: cached.key })
    await seedSnapshot(registry, TASK_ID, cached, new Date().toISOString())

    renderSection(api)
    expect(await screen.findByText(cached.summary)).toBeTruthy()
    expect(invoke).not.toHaveBeenCalled()

    await api.events.emit(REFRESH_EVENT, null)

    expect(await screen.findByText(fetched.summary)).toBeTruthy()
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('frees the busy state when a background read supersedes a forced one', async () => {
    const issue = makeIssue()
    let release: (result: IssueResult) => void = () => undefined
    const { api, registry } = makeHarness({
      respond: () => new Promise<IssueResult>((resolve) => { release = resolve }),
    })
    await registry.storage.task(TASK_ID).set(TASK_KEY.link, { key: issue.key })
    await seedSnapshot(registry, TASK_ID, issue, new Date().toISOString())

    renderSection(api)
    expect(await screen.findByText(issue.summary)).toBeTruthy()

    await fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(screen.getByRole('button', { name: 'Refreshing…' })).toBeTruthy()

    await fireEvent.click(screen.getByRole('button', { name: 'Linked Issue' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Linked Issue' }))
    release({ ok: true, issue })
    await settled()

    const refreshButton = await screen.findByRole('button', { name: 'Refresh' })
    expect((refreshButton as HTMLButtonElement).disabled).toBe(false)
  })

  it('never paints a Snapshot recorded for a different Issue Key', async () => {
    const previous = makeIssue({ key: 'PROJ-9', summary: 'The previously linked Issue' })
    const { api, invoke, registry } = makeHarness({
      results: [{ ok: false, error: 'network', message: 'Jira is temporarily unavailable.' }],
    })
    await registry.storage.task(TASK_ID).set(TASK_KEY.link, { key: 'PROJ-7' })
    await seedSnapshot(registry, TASK_ID, previous, new Date().toISOString())

    renderSection(api)

    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1))
    await settled()

    expect(screen.queryByText(previous.summary)).toBeNull()
    expect(screen.getByText('PROJ-7')).toBeTruthy()
    expect((await screen.findByRole('alert')).textContent).toContain('Jira is temporarily unavailable.')
  })

  it('drops an alert that a later successful read has made untrue', async () => {
    const issue = makeIssue()
    const recovered = makeIssue({ summary: 'Jira came back' })
    const { api, registry } = makeHarness({
      results: [
        { ok: false, error: 'network', message: 'Jira is temporarily unavailable.' },
        { ok: false, error: 'network', message: 'Jira is temporarily unavailable.' },
        { ok: true, issue: recovered },
      ],
    })
    await registry.storage.task(TASK_ID).set(TASK_KEY.link, { key: issue.key })
    await seedSnapshot(registry, TASK_ID, issue, new Date(Date.now() - 600_000).toISOString())

    renderSection(api)
    expect(await screen.findByText(issue.summary)).toBeTruthy()

    await fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Jira is temporarily unavailable.')

    await fireEvent.click(screen.getByRole('button', { name: 'Linked Issue' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Linked Issue' }))

    expect(await screen.findByText(recovered.summary)).toBeTruthy()
    await settled()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('reads Jira when the section is expanded onto a stale Snapshot', async () => {
    const issue = makeIssue()
    const { api, invoke, registry } = makeHarness({
      results: [
        { ok: false, error: 'network', message: 'Jira is temporarily unavailable.' },
        { ok: false, error: 'network', message: 'Jira is temporarily unavailable.' },
      ],
    })
    await registry.storage.task(TASK_ID).set(TASK_KEY.link, { key: issue.key })
    await seedSnapshot(registry, TASK_ID, issue, new Date(Date.now() - 600_000).toISOString())

    renderSection(api)
    expect(await screen.findByText(issue.summary)).toBeTruthy()
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1))

    await fireEvent.click(screen.getByRole('button', { name: 'Linked Issue' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Linked Issue' }))

    // The failed read left the Snapshot untouched, so it is still stale on open.
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2))
  })

  it('reads Jira when linking a key that already has a fresh Snapshot', async () => {
    const issue = makeIssue()
    const { api, invoke, registry } = makeHarness({ results: [{ ok: true, issue }] })
    await seedSnapshot(registry, TASK_ID, issue, new Date().toISOString())

    renderSection(api)
    const input = await screen.findByLabelText('Issue Key')
    await fireEvent.input(input, { target: { value: issue.key } })
    await fireEvent.click(screen.getByRole('button', { name: 'Link Issue' }))

    expect(await screen.findByText(issue.summary)).toBeTruthy()
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('replaces a stale Snapshot with the Jira read it triggered, silently', async () => {
    const stale = makeIssue({ summary: 'What the Snapshot remembered' })
    const current = makeIssue({ summary: 'What Jira says now', status: 'Done' })
    const { api, invoke, registry } = makeHarness({ results: [{ ok: true, issue: current }] })
    await registry.storage.task(TASK_ID).set(TASK_KEY.link, { key: stale.key })
    await seedSnapshot(registry, TASK_ID, stale, new Date(Date.now() - 600_000).toISOString())

    renderSection(api)

    expect(await screen.findByText(current.summary)).toBeTruthy()
    await settled()

    expect(screen.queryByText(stale.summary)).toBeNull()
    expect(screen.getByText('Done')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(invoke).toHaveBeenCalledTimes(1)
  })
})
