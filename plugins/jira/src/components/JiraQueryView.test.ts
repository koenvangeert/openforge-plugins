// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte'
import type { FrontendOpenForgeAPI } from '@openforge-app/plugin-sdk/frontend'
import type { Task } from '@openforge-app/plugin-sdk/domain'
import { createOpenForgeRegistryFake } from '@openforge-app/plugin-sdk/testing'
import { describe, expect, it, vi } from 'vitest'
import { HOST_EVENT, METHOD, PROJECT_KEY, REFRESH_EVENT } from '../lib/protocol'
import { DEFAULT_INTAKE_TEMPLATE } from '../lib/intakeTemplate'
import JiraQueryView from './JiraQueryView.svelte'

function jiraIssue(key: string, summary: string) {
  return {
    key,
    summary,
    status: 'To Do',
    priority: null,
    issueType: 'Task',
    assignee: null,
    updated: null,
    descriptionHtml: '',
    url: `https://acme.atlassian.net/browse/${key}`,
  }
}

function openForgeTask(id: string, projectId = 'P-1'): Task {
  return {
    id,
    initial_prompt: '',
    status: 'backlog',
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
    project_id: projectId,
    created_at: 0,
    updated_at: 0,
  }
}

describe('JiraQueryView', () => {
  it('opens with the active Project JQL and presents its Issues as a selectable master-detail table', async () => {
    const registry = createOpenForgeRegistryFake({ pluginId: 'dev.kvg.jira', projectId: 'P-1' })
    await registry.storage.project('P-1').set(PROJECT_KEY.intakeQuery, {
      jql: 'project = KVG AND status = Triage',
    })
    await registry.storage.project('P-2').set(PROJECT_KEY.intakeQuery, {
      jql: 'project = NEXT AND status = Backlog',
    })
    const invoke = vi.fn(async () => ({
      ok: true,
      issues: [{
        key: 'KVG-1494',
        summary: 'Build the Jira Intake Workspace',
        status: 'In Progress',
        priority: 'High',
        issueType: 'Story',
        assignee: 'Koen',
        updated: '2026-07-17T09:00:00.000Z',
        descriptionHtml: '<p>Use the shared Issue Intake workflow.</p>',
        url: 'https://acme.atlassian.net/browse/KVG-1494',
      }],
      page: { isLast: true, nextPageToken: null },
    }))
    const api: FrontendOpenForgeAPI = {
      ...registry.frontendApi,
      backend: {
        ...registry.frontendApi.backend,
        state: 'ready',
        whenReady: async () => undefined,
        invoke: invoke as FrontendOpenForgeAPI['backend']['invoke'],
      },
    }

    render(JiraQueryView, {
      props: { api, context: { ...api.context.getSnapshot(), projectId: null } },
    })

    await waitFor(() => expect(invoke).toHaveBeenCalledWith(METHOD.search, {
      jql: 'project = KVG AND status = Triage',
      nextPageToken: null,
    }))
    await waitFor(() => expect(
      screen.getByRole('row', { name: /KVG-1494 Build the Jira Intake Workspace/ }).getAttribute('aria-selected'),
    ).toBe('true'))
    expect(screen.getByRole('heading', { name: 'Jira intake' })).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'Issue Key' })).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'Summary' })).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'Status' })).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'Priority' })).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'Assignee' })).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'OpenForge' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Build the Jira Intake Workspace' })).toBeTruthy()
    expect(screen.getByText('Use the shared Issue Intake workflow.')).toBeTruthy()
    expect(screen.queryByRole('form', { name: 'Issue Key lookup' })).toBeNull()
  })

  it('selects an Issue by clicking anywhere on its row or pressing Enter and Space', async () => {
    const registry = createOpenForgeRegistryFake({ pluginId: 'dev.kvg.jira', projectId: 'P-1' })
    const invoke = vi.fn(async () => ({
      ok: true,
      issues: [jiraIssue('PROJ-1', 'First Issue'), jiraIssue('PROJ-2', 'Second Issue')],
      page: { isLast: true, nextPageToken: null },
    }))
    const api: FrontendOpenForgeAPI = {
      ...registry.frontendApi,
      backend: {
        ...registry.frontendApi.backend,
        state: 'ready',
        whenReady: async () => undefined,
        invoke: invoke as FrontendOpenForgeAPI['backend']['invoke'],
      },
    }
    render(JiraQueryView, { props: { api, context: api.context.getSnapshot() } })
    await screen.findByRole('heading', { name: 'First Issue' })
    const firstRow = screen.getByRole('row', { name: /PROJ-1.*First Issue/ })
    const secondRow = screen.getByRole('row', { name: /PROJ-2.*Second Issue/ })

    expect(secondRow.tabIndex).toBe(0)
    await fireEvent.click(within(secondRow).getByText('Second Issue'))
    expect(screen.getByRole('heading', { name: 'Second Issue' })).toBeTruthy()

    firstRow.focus()
    await fireEvent.keyDown(firstRow, { key: 'Enter' })
    expect(screen.getByRole('heading', { name: 'First Issue' })).toBeTruthy()

    secondRow.focus()
    await fireEvent.keyDown(secondRow, { key: ' ' })
    expect(screen.getByRole('heading', { name: 'Second Issue' })).toBeTruthy()
  })

  it('moves the selection up and down with j/k and the arrow keys while keeping focus in the list', async () => {
    const registry = createOpenForgeRegistryFake({ pluginId: 'dev.kvg.jira', projectId: 'P-1' })
    const invoke = vi.fn(async () => ({
      ok: true,
      issues: [
        jiraIssue('PROJ-1', 'First Issue'),
        jiraIssue('PROJ-2', 'Second Issue'),
        jiraIssue('PROJ-3', 'Third Issue'),
      ],
      page: { isLast: true, nextPageToken: null },
    }))
    const api: FrontendOpenForgeAPI = {
      ...registry.frontendApi,
      backend: {
        ...registry.frontendApi.backend,
        state: 'ready',
        whenReady: async () => undefined,
        invoke: invoke as FrontendOpenForgeAPI['backend']['invoke'],
      },
    }
    render(JiraQueryView, { props: { api, context: api.context.getSnapshot() } })
    await screen.findByRole('heading', { name: 'First Issue' })
    const firstRow = screen.getByRole('row', { name: /PROJ-1.*First Issue/ })
    const secondRow = screen.getByRole('row', { name: /PROJ-2.*Second Issue/ })
    const thirdRow = screen.getByRole('row', { name: /PROJ-3.*Third Issue/ })

    firstRow.focus()
    await fireEvent.keyDown(firstRow, { key: 'ArrowDown' })
    expect(secondRow.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(secondRow)
    expect(screen.getByRole('heading', { name: 'Second Issue' })).toBeTruthy()

    await fireEvent.keyDown(secondRow, { key: 'j' })
    expect(thirdRow.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(thirdRow)

    // Clamps at the bottom edge instead of wrapping.
    await fireEvent.keyDown(thirdRow, { key: 'ArrowDown' })
    expect(thirdRow.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(thirdRow)

    await fireEvent.keyDown(thirdRow, { key: 'k' })
    expect(secondRow.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(secondRow)

    await fireEvent.keyDown(secondRow, { key: 'ArrowUp' })
    expect(firstRow.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(firstRow)

    // Clamps at the top edge instead of wrapping.
    await fireEvent.keyDown(firstRow, { key: 'k' })
    expect(firstRow.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(firstRow)
  })

  it('navigates to the next Jira page without appending it to the current page', async () => {
    const registry = createOpenForgeRegistryFake({ pluginId: 'dev.kvg.jira', projectId: 'P-1' })
    const invoke = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        issues: [jiraIssue('PROJ-1', 'First page')],
        page: { isLast: false, nextPageToken: 'next-2' },
      })
      .mockResolvedValueOnce({
        ok: true,
        issues: [jiraIssue('PROJ-2', 'Second page')],
        page: { isLast: true, nextPageToken: null },
      })
    const api: FrontendOpenForgeAPI = {
      ...registry.frontendApi,
      backend: {
        ...registry.frontendApi.backend,
        state: 'ready',
        whenReady: async () => undefined,
        invoke: invoke as FrontendOpenForgeAPI['backend']['invoke'],
      },
    }

    render(JiraQueryView, { props: { api, context: api.context.getSnapshot() } })

    await screen.findByRole('row', { name: /PROJ-1.*First page/ })
    await fireEvent.click(screen.getByRole('button', { name: 'Next page' }))

    await screen.findByRole('row', { name: /PROJ-2.*Second page/ })
    expect(screen.queryByRole('row', { name: /PROJ-1.*First page/ })).toBeNull()
    expect(invoke).toHaveBeenLastCalledWith(METHOD.search, {
      jql: 'assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC',
      nextPageToken: 'next-2',
    })
    expect(screen.getByText('Page 2')).toBeTruthy()
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Second page' })))
  })

  it('sorts all Jira pages by status and persists the toggled direction in the Project JQL', async () => {
    const registry = createOpenForgeRegistryFake({ pluginId: 'dev.kvg.jira', projectId: 'P-1' })
    await registry.storage.project('P-1').set(PROJECT_KEY.intakeQuery, {
      jql: 'project = KVG ORDER BY updated DESC',
    })
    const invoke = vi.fn(async () => ({
      ok: true,
      issues: [jiraIssue('PROJ-1', 'Sortable Issue')],
      page: { isLast: true, nextPageToken: null },
    }))
    const api: FrontendOpenForgeAPI = {
      ...registry.frontendApi,
      backend: {
        ...registry.frontendApi.backend,
        state: 'ready',
        whenReady: async () => undefined,
        invoke: invoke as FrontendOpenForgeAPI['backend']['invoke'],
      },
    }
    render(JiraQueryView, { props: { api, context: api.context.getSnapshot() } })
    await screen.findByRole('row', { name: /PROJ-1.*Sortable Issue/ })

    const statusHeader = screen.getByRole('columnheader', { name: /Status/ })
    expect(statusHeader.getAttribute('aria-sort')).toBe('none')
    await fireEvent.click(screen.getByRole('button', { name: 'Sort by status ascending' }))

    await waitFor(() => expect(invoke).toHaveBeenLastCalledWith(METHOD.search, {
      jql: 'project = KVG ORDER BY status ASC, updated DESC',
      nextPageToken: null,
    }))
    await waitFor(() => expect(statusHeader.getAttribute('aria-sort')).toBe('ascending'))
    await waitFor(async () => {
      await expect(registry.storage.project('P-1').get(PROJECT_KEY.intakeQuery)).resolves.toEqual({
        jql: 'project = KVG ORDER BY status ASC, updated DESC',
      })
    })

    await fireEvent.click(screen.getByRole('button', { name: 'Sort by status descending' }))

    await waitFor(() => expect(invoke).toHaveBeenLastCalledWith(METHOD.search, {
      jql: 'project = KVG ORDER BY status DESC, updated DESC',
      nextPageToken: null,
    }))
    await waitFor(() => expect(statusHeader.getAttribute('aria-sort')).toBe('descending'))
    await waitFor(async () => {
      await expect(registry.storage.project('P-1').get(PROJECT_KEY.intakeQuery)).resolves.toEqual({
        jql: 'project = KVG ORDER BY status DESC, updated DESC',
      })
    })
  })

  it('applies typed JQL immediately and persists it as the Project JQL', async () => {
    const registry = createOpenForgeRegistryFake({ pluginId: 'dev.kvg.jira', projectId: 'P-1' })
    await registry.storage.project('P-1').set(PROJECT_KEY.intakeQuery, {
      jql: 'assignee = currentUser()',
    })
    const invoke = vi.fn(async () => ({
      ok: true,
      issues: [],
      page: { isLast: true, nextPageToken: null },
    }))
    const api: FrontendOpenForgeAPI = {
      ...registry.frontendApi,
      backend: {
        ...registry.frontendApi.backend,
        state: 'ready',
        whenReady: async () => undefined,
        invoke: invoke as FrontendOpenForgeAPI['backend']['invoke'],
      },
    }
    render(JiraQueryView, { props: { api, context: api.context.getSnapshot() } })
    await waitFor(() => expect(invoke).toHaveBeenCalledWith(METHOD.search, {
      jql: 'assignee = currentUser()',
      nextPageToken: null,
    }))

    await fireEvent.input(screen.getByRole('textbox', { name: 'JQL' }), {
      target: { value: 'project = KVG ORDER BY priority DESC' },
    })
    await fireEvent.click(screen.getByRole('button', { name: 'Apply JQL' }))

    await waitFor(() => expect(invoke).toHaveBeenCalledWith(METHOD.search, {
      jql: 'project = KVG ORDER BY priority DESC',
      nextPageToken: null,
    }))
    await waitFor(async () => {
      await expect(registry.storage.project('P-1').get(PROJECT_KEY.intakeQuery)).resolves.toEqual({
        jql: 'project = KVG ORDER BY priority DESC',
      })
    })
  })

  it('creates and links a backlog Task from the selected Issue in the active Project', async () => {
    const registry = createOpenForgeRegistryFake({ pluginId: 'dev.kvg.jira', projectId: 'P-1' })
    const invoke = vi.fn(async () => ({
      ok: true,
      issues: [jiraIssue('PROJ-7', 'Create intake task')],
      page: { isLast: true, nextPageToken: null },
    }))
    const api: FrontendOpenForgeAPI = {
      ...registry.frontendApi,
      backend: {
        ...registry.frontendApi.backend,
        state: 'ready',
        whenReady: async () => undefined,
        invoke: invoke as FrontendOpenForgeAPI['backend']['invoke'],
      },
    }
    render(JiraQueryView, { props: { api, context: api.context.getSnapshot() } })
    await screen.findByRole('heading', { name: 'Create intake task' })

    await fireEvent.click(screen.getByRole('button', { name: 'Create Task' }))

    await screen.findByText('Task mock-task-1 was created and linked to PROJ-7.')
    expect(registry.calls.taskCreations).toEqual([{
      projectId: 'P-1',
      initialPrompt: 'PROJ-7: Create intake task',
    }])
    expect(registry.calls.taskImplementationStarts).toEqual([])
    await expect(registry.storage.task('mock-task-1').get('link')).resolves.toEqual({ key: 'PROJ-7' })
    const linkedTaskLink = within(screen.getByLabelText('Linked OpenForge Tasks'))
      .getByRole('button', { name: 'PROJ-7: Create intake task' })
    await fireEvent.click(linkedTaskLink)
    expect(registry.calls.navigationRequests).toEqual([{ viewId: 'board', taskId: 'mock-task-1' }])
  })

  it('saves an edited Task template for the active Project without re-running the search', async () => {
    const registry = createOpenForgeRegistryFake({ pluginId: 'dev.kvg.jira', projectId: 'P-1' })
    const invoke = vi.fn(async () => ({
      ok: true,
      issues: [jiraIssue('PROJ-1', 'Templated Issue')],
      page: { isLast: true, nextPageToken: null },
    }))
    const api: FrontendOpenForgeAPI = {
      ...registry.frontendApi,
      backend: {
        ...registry.frontendApi.backend,
        state: 'ready',
        whenReady: async () => undefined,
        invoke: invoke as FrontendOpenForgeAPI['backend']['invoke'],
      },
    }
    render(JiraQueryView, { props: { api, context: api.context.getSnapshot() } })
    await screen.findByRole('heading', { name: 'Templated Issue' })
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1))

    const templateField = await waitFor(() => {
      const field = screen.getByRole('textbox', { name: 'Intake template' }) as HTMLTextAreaElement
      expect(field.disabled).toBe(false)
      return field
    })
    expect(templateField.value).toBe(DEFAULT_INTAKE_TEMPLATE)

    await fireEvent.input(templateField, { target: { value: '{{summary}} — {{key}}\n\n{{description}}' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Save template' }))

    await waitFor(async () => {
      await expect(registry.storage.project('P-1').get(PROJECT_KEY.intakeTemplate)).resolves.toEqual({
        template: '{{summary}} — {{key}}\n\n{{description}}',
      })
    })
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('rejects a template with an unknown placeholder and keeps the stored template intact', async () => {
    const registry = createOpenForgeRegistryFake({ pluginId: 'dev.kvg.jira', projectId: 'P-1' })
    const invoke = vi.fn(async () => ({
      ok: true,
      issues: [jiraIssue('PROJ-1', 'Templated Issue')],
      page: { isLast: true, nextPageToken: null },
    }))
    const api: FrontendOpenForgeAPI = {
      ...registry.frontendApi,
      backend: {
        ...registry.frontendApi.backend,
        state: 'ready',
        whenReady: async () => undefined,
        invoke: invoke as FrontendOpenForgeAPI['backend']['invoke'],
      },
    }
    render(JiraQueryView, { props: { api, context: api.context.getSnapshot() } })
    await screen.findByRole('heading', { name: 'Templated Issue' })
    const templateField = await waitFor(() => {
      const field = screen.getByRole('textbox', { name: 'Intake template' }) as HTMLTextAreaElement
      expect(field.disabled).toBe(false)
      return field
    })

    await fireEvent.input(templateField, { target: { value: '{{key}} {{status}}' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Save template' }))

    expect((await screen.findByRole('alert')).textContent).toContain('{{status}}')
    await expect(registry.storage.project('P-1').get(PROJECT_KEY.intakeTemplate)).resolves.toEqual({
      template: DEFAULT_INTAKE_TEMPLATE,
    })
  })

  it('requires explicit duplicate confirmation before Create and Start', async () => {
    const registry = createOpenForgeRegistryFake({ pluginId: 'dev.kvg.jira', projectId: 'P-1' })
    await registry.storage.task('existing-task').set('link', { key: 'PROJ-7' })
    const invoke = vi.fn(async () => ({
      ok: true,
      issues: [jiraIssue('PROJ-7', 'Duplicate Issue')],
      page: { isLast: true, nextPageToken: null },
    }))
    const api: FrontendOpenForgeAPI = {
      ...registry.frontendApi,
      backend: {
        ...registry.frontendApi.backend,
        state: 'ready',
        whenReady: async () => undefined,
        invoke: invoke as FrontendOpenForgeAPI['backend']['invoke'],
      },
      tasks: {
        ...registry.frontendApi.tasks,
        list: async () => [openForgeTask('existing-task')],
      },
    }
    render(JiraQueryView, { props: { api, context: api.context.getSnapshot() } })
    await screen.findByRole('heading', { name: 'Duplicate Issue' })

    await fireEvent.click(screen.getByRole('button', { name: 'Create and Start' }))

    await screen.findByText('PROJ-7 already has 1 linked Task in the active Project. Confirm to create another Task.')
    const confirmDuplicate = screen.getByRole('button', { name: 'Create and Start another Task' })
    await waitFor(() => expect(document.activeElement).toBe(confirmDuplicate))
    expect(registry.calls.taskCreations).toEqual([])
    expect(registry.calls.taskImplementationStarts).toEqual([])

    await fireEvent.click(confirmDuplicate)
    await screen.findByText('Task mock-task-1 was created, linked, and started.')
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Create and Start' })))
    expect(registry.calls.taskCreations).toHaveLength(1)
    expect(registry.calls.taskImplementationStarts).toEqual([{ taskId: 'mock-task-1' }])
  })

  it('reports partial success when starting fails after the Task is created and linked', async () => {
    const registry = createOpenForgeRegistryFake({ pluginId: 'dev.kvg.jira', projectId: 'P-1' })
    const startImplementation = vi.fn(async () => { throw new Error('No provider is configured.') })
    const invoke = vi.fn(async () => ({
      ok: true,
      issues: [jiraIssue('PROJ-8', 'Start failure')],
      page: { isLast: true, nextPageToken: null },
    }))
    const api: FrontendOpenForgeAPI = {
      ...registry.frontendApi,
      backend: {
        ...registry.frontendApi.backend,
        state: 'ready',
        whenReady: async () => undefined,
        invoke: invoke as FrontendOpenForgeAPI['backend']['invoke'],
      },
      tasks: { ...registry.frontendApi.tasks, startImplementation },
    }
    render(JiraQueryView, { props: { api, context: api.context.getSnapshot() } })
    await screen.findByRole('heading', { name: 'Start failure' })

    await fireEvent.click(screen.getByRole('button', { name: 'Create and Start' }))

    await screen.findByText(
      'Task mock-task-1 was created and linked, but implementation could not start: No provider is configured.',
    )
    expect(startImplementation).toHaveBeenCalledWith({ taskId: 'mock-task-1' })
    await expect(registry.storage.task('mock-task-1').get('link')).resolves.toEqual({ key: 'PROJ-8' })
  })

  it('renders a loading state followed by the empty query state', async () => {
    const registry = createOpenForgeRegistryFake({ pluginId: 'dev.kvg.jira', projectId: 'P-1' })
    let resolveSearch!: (value: unknown) => void
    const invoke = vi.fn(() => new Promise((resolve) => { resolveSearch = resolve }))
    const api: FrontendOpenForgeAPI = {
      ...registry.frontendApi,
      backend: {
        ...registry.frontendApi.backend,
        state: 'ready',
        whenReady: async () => undefined,
        invoke: invoke as FrontendOpenForgeAPI['backend']['invoke'],
      },
    }
    render(JiraQueryView, { props: { api, context: api.context.getSnapshot() } })

    await screen.findByText('Loading Jira Issues…')
    await waitFor(() => expect(invoke).toHaveBeenCalledOnce())
    resolveSearch({ ok: true, issues: [], page: { isLast: true, nextPageToken: null } })

    await screen.findByText('No Issues match the current JQL query.')
  })

  it('shows typed Jira search failures as an accessible error', async () => {
    const registry = createOpenForgeRegistryFake({ pluginId: 'dev.kvg.jira', projectId: 'P-1' })
    const invoke = vi.fn(async () => ({
      ok: false,
      error: 'no-credentials',
      message: 'Add your Jira credentials in Settings.',
    }))
    const api: FrontendOpenForgeAPI = {
      ...registry.frontendApi,
      backend: {
        ...registry.frontendApi.backend,
        state: 'ready',
        whenReady: async () => undefined,
        invoke: invoke as FrontendOpenForgeAPI['backend']['invoke'],
      },
    }
    render(JiraQueryView, { props: { api, context: api.context.getSnapshot() } })

    expect((await screen.findByRole('alert')).textContent).toContain('Add your Jira credentials in Settings.')
  })

  it('moves focus to details when a table Issue is selected', async () => {
    const registry = createOpenForgeRegistryFake({ pluginId: 'dev.kvg.jira', projectId: 'P-1' })
    const invoke = vi.fn(async () => ({
      ok: true,
      issues: [jiraIssue('PROJ-1', 'First Issue'), jiraIssue('PROJ-2', 'Second Issue')],
      page: { isLast: true, nextPageToken: null },
    }))
    const api: FrontendOpenForgeAPI = {
      ...registry.frontendApi,
      backend: {
        ...registry.frontendApi.backend,
        state: 'ready',
        whenReady: async () => undefined,
        invoke: invoke as FrontendOpenForgeAPI['backend']['invoke'],
      },
    }
    render(JiraQueryView, { props: { api, context: api.context.getSnapshot() } })
    const selectSecond = await screen.findByRole('row', { name: /PROJ-2.*Second Issue/ })

    await fireEvent.click(selectSecond)

    const detailsHeading = screen.getByRole('heading', { name: 'Second Issue' })
    await waitFor(() => expect(document.activeElement).toBe(detailsHeading))
    expect(screen.getByRole('row', { name: /PROJ-2.*Second Issue/ }).getAttribute('aria-selected')).toBe('true')
  })

  it('refreshes only on explicit UI or plugin refresh events and reloads after active Project navigation', async () => {
    const registry = createOpenForgeRegistryFake({ pluginId: 'dev.kvg.jira', projectId: 'P-1' })
    await registry.storage.project('P-2').set(PROJECT_KEY.intakeQuery, { jql: 'project = NEXT' })
    const invoke = vi.fn(async () => ({
      ok: true,
      issues: [],
      page: { isLast: true, nextPageToken: null },
    }))
    const api: FrontendOpenForgeAPI = {
      ...registry.frontendApi,
      backend: {
        ...registry.frontendApi.backend,
        state: 'ready',
        whenReady: async () => undefined,
        invoke: invoke as FrontendOpenForgeAPI['backend']['invoke'],
      },
    }
    render(JiraQueryView, { props: { api, context: api.context.getSnapshot() } })
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1))

    await fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2))
    await api.events.emit(REFRESH_EVENT, null)
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(3))
    await api.events.emitGlobal(HOST_EVENT.navigationChanged, {
      activeProjectId: 'P-2',
      currentView: 'plugin:dev.kvg.jira:query',
    })
    await waitFor(() => expect(invoke).toHaveBeenLastCalledWith(METHOD.search, {
      jql: 'project = NEXT',
      nextPageToken: null,
    }))
  })

  it('does not paint an old Project search after navigation begins', async () => {
    const registry = createOpenForgeRegistryFake({ pluginId: 'dev.kvg.jira', projectId: 'P-1' })
    await registry.storage.project('P-2').set(PROJECT_KEY.intakeQuery, { jql: 'project = NEXT' })
    let resolveFirstSearch!: (value: unknown) => void
    let releaseProjectRead!: () => void
    const firstSearch = new Promise((resolve) => { resolveFirstSearch = resolve })
    const projectReadGate = new Promise<void>((resolve) => { releaseProjectRead = resolve })
    const invoke = vi.fn(async (_method: string, payload: unknown) => {
      const jql = (payload as { jql: string }).jql
      if (jql === 'project = NEXT') {
        return { ok: true, issues: [jiraIssue('NEXT-1', 'New Project Issue')], page: { isLast: true, nextPageToken: null } }
      }
      return firstSearch
    })
    const storage = registry.storage
    const api: FrontendOpenForgeAPI = {
      ...registry.frontendApi,
      storage: {
        global: storage.global,
        project: (id) => {
          const scope = storage.project(id)
          return id === 'P-2'
            ? { ...scope, get: async (key) => { await projectReadGate; return scope.get(key) } }
            : scope
        },
        task: (id) => storage.task(id),
      },
      backend: {
        ...registry.frontendApi.backend,
        state: 'ready',
        whenReady: async () => undefined,
        invoke: invoke as FrontendOpenForgeAPI['backend']['invoke'],
      },
    }
    render(JiraQueryView, { props: { api, context: api.context.getSnapshot() } })
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1))

    await api.events.emitGlobal(HOST_EVENT.navigationChanged, {
      activeProjectId: 'P-2',
      currentView: 'plugin:dev.kvg.jira:query',
    })
    expect((screen.getByRole('textbox', { name: 'JQL' }) as HTMLTextAreaElement).disabled).toBe(true)
    await api.events.emit(REFRESH_EVENT, null)
    expect(invoke).toHaveBeenCalledTimes(1)
    resolveFirstSearch({
      ok: true,
      issues: [jiraIssue('OLD-1', 'Old Project Issue')],
      page: { isLast: true, nextPageToken: null },
    })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(screen.queryByRole('row', { name: /OLD-1.*Old Project Issue/ })).toBeNull()
    releaseProjectRead()
    await screen.findByRole('row', { name: /NEXT-1.*New Project Issue/ })
  })

  it('reports a completed intake at workspace level after another Issue is selected', async () => {
    const registry = createOpenForgeRegistryFake({ pluginId: 'dev.kvg.jira', projectId: 'P-1' })
    let resolveCreate!: (task: Task) => void
    const create = vi.fn(() => new Promise<Task>((resolve) => { resolveCreate = resolve }))
    const invoke = vi.fn(async () => ({
      ok: true,
      issues: [jiraIssue('PROJ-1', 'First Issue'), jiraIssue('PROJ-2', 'Second Issue')],
      page: { isLast: true, nextPageToken: null },
    }))
    const api: FrontendOpenForgeAPI = {
      ...registry.frontendApi,
      backend: {
        ...registry.frontendApi.backend,
        state: 'ready',
        whenReady: async () => undefined,
        invoke: invoke as FrontendOpenForgeAPI['backend']['invoke'],
      },
      tasks: { ...registry.frontendApi.tasks, create },
    }
    render(JiraQueryView, { props: { api, context: api.context.getSnapshot() } })
    await screen.findByRole('heading', { name: 'First Issue' })
    await fireEvent.click(screen.getByRole('button', { name: 'Create Task' }))
    await waitFor(() => expect(create).toHaveBeenCalledOnce())

    await fireEvent.click(screen.getByRole('row', { name: /PROJ-2.*Second Issue/ }))
    resolveCreate({ ...openForgeTask('created-task'), initial_prompt: 'PROJ-1: First Issue' })
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Second Issue' })))

    expect(await screen.findByText('Task created-task was created and linked to PROJ-1.')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Second Issue' })).toBeTruthy()
  })

  it('keeps a completed intake outside details after navigating to the same Issue key in another Project', async () => {
    const registry = createOpenForgeRegistryFake({ pluginId: 'dev.kvg.jira', projectId: 'P-1' })
    let resolveCreate!: (task: Task) => void
    const create = vi.fn(() => new Promise<Task>((resolve) => { resolveCreate = resolve }))
    let searchCount = 0
    const invoke = vi.fn(async () => {
      searchCount += 1
      return {
        ok: true,
        issues: [jiraIssue('SHARED-1', searchCount === 1 ? 'First Project Issue' : 'Second Project Issue')],
        page: { isLast: true, nextPageToken: null },
      }
    })
    const api: FrontendOpenForgeAPI = {
      ...registry.frontendApi,
      backend: {
        ...registry.frontendApi.backend,
        state: 'ready',
        whenReady: async () => undefined,
        invoke: invoke as FrontendOpenForgeAPI['backend']['invoke'],
      },
      tasks: { ...registry.frontendApi.tasks, create },
    }
    render(JiraQueryView, { props: { api, context: api.context.getSnapshot() } })
    await screen.findByRole('heading', { name: 'First Project Issue' })
    await fireEvent.click(screen.getByRole('button', { name: 'Create Task' }))
    await waitFor(() => expect(create).toHaveBeenCalledOnce())

    await api.events.emitGlobal(HOST_EVENT.navigationChanged, {
      activeProjectId: 'P-2',
      currentView: 'plugin:dev.kvg.jira:query',
    })
    await screen.findByRole('heading', { name: 'Second Project Issue' })
    resolveCreate({ ...openForgeTask('created-task', 'P-1'), initial_prompt: 'SHARED-1: First Project Issue' })

    const notice = await screen.findByText('Task created-task was created and linked to SHARED-1.')
    const details = screen.getByRole('complementary', { name: 'Issue details' })
    expect(notice).toBeTruthy()
    expect(within(details).queryByText('Task created-task was created and linked to SHARED-1.')).toBeNull()
  })

  it('shows Project JQL storage failures instead of remaining in loading state', async () => {
    const registry = createOpenForgeRegistryFake({ pluginId: 'dev.kvg.jira', projectId: 'P-1' })
    const storage = registry.storage
    const api: FrontendOpenForgeAPI = {
      ...registry.frontendApi,
      storage: {
        global: storage.global,
        project: (id) => {
          const scope = storage.project(id)
          return id === 'P-1'
            ? { ...scope, get: async () => { throw new Error('Project storage is unavailable.') } }
            : scope
        },
        task: (id) => storage.task(id),
      },
    }

    render(JiraQueryView, { props: { api, context: api.context.getSnapshot() } })

    expect((await screen.findByRole('alert')).textContent).toContain('Project storage is unavailable.')
    expect(screen.queryByText('Loading Jira Issues…')).toBeNull()
    expect((screen.getByRole('textbox', { name: 'JQL' }) as HTMLTextAreaElement).disabled).toBe(true)
  })

  it('ignores accepted JQL persistence that completes after Project navigation', async () => {
    const registry = createOpenForgeRegistryFake({ pluginId: 'dev.kvg.jira', projectId: 'P-1' })
    await registry.storage.project('P-2').set(PROJECT_KEY.intakeQuery, { jql: 'project = NEXT' })
    let delaySave = false
    let releaseSave!: () => void
    let saveStarted!: () => void
    const saveGate = new Promise<void>((resolve) => { releaseSave = resolve })
    const saveStartedPromise = new Promise<void>((resolve) => { saveStarted = resolve })
    const storage = registry.storage
    const invoke = vi.fn(async () => ({ ok: true, issues: [], page: { isLast: true, nextPageToken: null } }))
    const api: FrontendOpenForgeAPI = {
      ...registry.frontendApi,
      storage: {
        global: storage.global,
        project: (id) => {
          const scope = storage.project(id)
          return id === 'P-1'
            ? {
                ...scope,
                set: async (key, value) => {
                  if (delaySave && key === PROJECT_KEY.intakeQuery) {
                    saveStarted()
                    await saveGate
                  }
                  await scope.set(key, value)
                },
              }
            : scope
        },
        task: (id) => storage.task(id),
      },
      backend: {
        ...registry.frontendApi.backend,
        state: 'ready',
        whenReady: async () => undefined,
        invoke: invoke as FrontendOpenForgeAPI['backend']['invoke'],
      },
    }
    render(JiraQueryView, { props: { api, context: api.context.getSnapshot() } })
    await waitFor(() => expect(invoke).toHaveBeenCalledOnce())
    await fireEvent.input(screen.getByRole('textbox', { name: 'JQL' }), {
      target: { value: 'project = OLD ORDER BY priority DESC' },
    })
    delaySave = true
    await fireEvent.click(screen.getByRole('button', { name: 'Apply JQL' }))
    await saveStartedPromise

    await api.events.emitGlobal(HOST_EVENT.navigationChanged, {
      activeProjectId: 'P-2',
      currentView: 'plugin:dev.kvg.jira:query',
    })
    await waitFor(() => expect(invoke).toHaveBeenCalledWith(METHOD.search, {
      jql: 'project = NEXT',
      nextPageToken: null,
    }))
    releaseSave()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect((screen.getByRole('textbox', { name: 'JQL' }) as HTMLTextAreaElement).value).toBe('project = NEXT')
  })

  it('does not let a stale Issue Link derivation overwrite a newer refresh', async () => {
    const registry = createOpenForgeRegistryFake({ pluginId: 'dev.kvg.jira', projectId: 'P-1' })
    await registry.storage.task('old-task').set('link', { key: 'PROJ-1' })
    let resolveFirstList!: (tasks: Task[]) => void
    const firstList = new Promise<Task[]>((resolve) => { resolveFirstList = resolve })
    const list = vi.fn()
      .mockImplementationOnce(() => firstList)
      .mockResolvedValueOnce([])
    const invoke = vi.fn(async () => ({
      ok: true,
      issues: [jiraIssue('PROJ-1', 'Refresh link state')],
      page: { isLast: true, nextPageToken: null },
    }))
    const api: FrontendOpenForgeAPI = {
      ...registry.frontendApi,
      backend: {
        ...registry.frontendApi.backend,
        state: 'ready',
        whenReady: async () => undefined,
        invoke: invoke as FrontendOpenForgeAPI['backend']['invoke'],
      },
      tasks: { ...registry.frontendApi.tasks, list },
    }
    render(JiraQueryView, { props: { api, context: api.context.getSnapshot() } })
    await waitFor(() => expect(list).toHaveBeenCalledOnce())

    await api.events.emit(REFRESH_EVENT, null)
    await screen.findByRole('row', { name: /PROJ-1.*Refresh link state/ })
    expect(screen.getByText('Unlinked')).toBeTruthy()
    resolveFirstList([openForgeTask('old-task')])
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(screen.getByText('Unlinked')).toBeTruthy()
    expect(screen.queryByText('1 linked')).toBeNull()
  })

  it('opens the single linked Task from its title in the issue table', async () => {
    const registry = createOpenForgeRegistryFake({ pluginId: 'dev.kvg.jira', projectId: 'P-1' })
    await registry.storage.task('only-task').set('link', { key: 'PROJ-1' })
    const invoke = vi.fn(async () => ({
      ok: true,
      issues: [jiraIssue('PROJ-1', 'First Issue')],
      page: { isLast: true, nextPageToken: null },
    }))
    const api: FrontendOpenForgeAPI = {
      ...registry.frontendApi,
      backend: {
        ...registry.frontendApi.backend,
        state: 'ready',
        whenReady: async () => undefined,
        invoke: invoke as FrontendOpenForgeAPI['backend']['invoke'],
      },
      tasks: {
        ...registry.frontendApi.tasks,
        list: async () => [{ ...openForgeTask('only-task'), initial_prompt: 'PROJ-1: Do the thing' }],
      },
    }
    render(JiraQueryView, { props: { api, context: api.context.getSnapshot() } })

    const row = await screen.findByRole('row', { name: /PROJ-1.*First Issue/ })
    const taskLink = await within(row).findByRole('button', { name: 'PROJ-1: Do the thing' })
    await fireEvent.click(taskLink)

    expect(registry.calls.navigationRequests).toEqual([{ viewId: 'board', taskId: 'only-task' }])
  })

  it('opens the most recently updated linked Task from the table badge without selecting the row', async () => {
    const registry = createOpenForgeRegistryFake({ pluginId: 'dev.kvg.jira', projectId: 'P-1' })
    await registry.storage.task('task-early').set('link', { key: 'PROJ-2' })
    await registry.storage.task('task-late').set('link', { key: 'PROJ-2' })
    const invoke = vi.fn(async () => ({
      ok: true,
      issues: [jiraIssue('PROJ-1', 'First Issue'), jiraIssue('PROJ-2', 'Second Issue')],
      page: { isLast: true, nextPageToken: null },
    }))
    const api: FrontendOpenForgeAPI = {
      ...registry.frontendApi,
      backend: {
        ...registry.frontendApi.backend,
        state: 'ready',
        whenReady: async () => undefined,
        invoke: invoke as FrontendOpenForgeAPI['backend']['invoke'],
      },
      tasks: {
        ...registry.frontendApi.tasks,
        list: async () => [
          { ...openForgeTask('task-early'), updated_at: 100 },
          { ...openForgeTask('task-late'), updated_at: 200 },
        ],
      },
    }
    render(JiraQueryView, { props: { api, context: api.context.getSnapshot() } })

    const secondRow = await screen.findByRole('row', { name: /PROJ-2.*Second Issue/ })
    const badge = await within(secondRow).findByRole('button', { name: '2 linked' })
    expect(secondRow.getAttribute('aria-selected')).toBe('false')

    await fireEvent.click(badge)

    expect(registry.calls.navigationRequests).toEqual([{ viewId: 'board', taskId: 'task-late' }])
    expect(secondRow.getAttribute('aria-selected')).toBe('false')
  })

  it('lists every linked Task in the details panel and opens each on click', async () => {
    const registry = createOpenForgeRegistryFake({ pluginId: 'dev.kvg.jira', projectId: 'P-1' })
    await registry.storage.task('task-early').set('link', { key: 'PROJ-2' })
    await registry.storage.task('task-late').set('link', { key: 'PROJ-2' })
    const invoke = vi.fn(async () => ({
      ok: true,
      issues: [jiraIssue('PROJ-1', 'First Issue'), jiraIssue('PROJ-2', 'Second Issue')],
      page: { isLast: true, nextPageToken: null },
    }))
    const api: FrontendOpenForgeAPI = {
      ...registry.frontendApi,
      backend: {
        ...registry.frontendApi.backend,
        state: 'ready',
        whenReady: async () => undefined,
        invoke: invoke as FrontendOpenForgeAPI['backend']['invoke'],
      },
      tasks: {
        ...registry.frontendApi.tasks,
        list: async () => [
          { ...openForgeTask('task-early'), updated_at: 100, initial_prompt: 'PROJ-2: Older work' },
          { ...openForgeTask('task-late'), updated_at: 200, initial_prompt: 'PROJ-2: Newer work' },
        ],
      },
    }
    render(JiraQueryView, { props: { api, context: api.context.getSnapshot() } })

    await fireEvent.click(await screen.findByRole('row', { name: /PROJ-2.*Second Issue/ }))
    const linkedTasks = within(await screen.findByLabelText('Linked OpenForge Tasks'))
    const [firstListed, secondListed] = linkedTasks.getAllByRole('button')
    expect(firstListed.textContent).toContain('PROJ-2: Newer work')
    expect(secondListed.textContent).toContain('PROJ-2: Older work')

    await fireEvent.click(secondListed)

    expect(registry.calls.navigationRequests).toEqual([{ viewId: 'board', taskId: 'task-early' }])
  })

})
