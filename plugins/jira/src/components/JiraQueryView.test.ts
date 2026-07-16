// @vitest-environment jsdom

import { render, waitFor } from '@testing-library/svelte'
import type { FrontendOpenForgeAPI } from '@openforge-app/plugin-sdk/frontend'
import { createOpenForgeRegistryFake } from '@openforge-app/plugin-sdk/testing'
import { describe, expect, it, vi } from 'vitest'
import { HOST_EVENT, METHOD, PROJECT_KEY } from '../lib/protocol'
import JiraQueryView from './JiraQueryView.svelte'

describe('JiraQueryView', () => {
  it('runs the live active Project filter and reloads it after Project navigation', async () => {
    const registry = createOpenForgeRegistryFake({ pluginId: 'dev.kvg.jira', projectId: 'P-1' })
    await registry.storage.project('P-1').set(PROJECT_KEY.intakeFilters, {
      filters: [{ id: 'triage', name: 'Triage', jql: 'project = KVG AND status = Triage' }],
      activeFilterId: 'triage',
    })
    await registry.storage.project('P-2').set(PROJECT_KEY.intakeFilters, {
      filters: [{ id: 'backlog', name: 'Backlog', jql: 'project = NEXT AND status = Backlog' }],
      activeFilterId: 'backlog',
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

    render(JiraQueryView, {
      props: { api, context: { ...api.context.getSnapshot(), projectId: null } },
    })

    await waitFor(() => expect(invoke).toHaveBeenCalledWith(METHOD.search, {
      jql: 'project = KVG AND status = Triage',
      nextPageToken: null,
    }))

    await api.events.emitGlobal(HOST_EVENT.navigationChanged, {
      activeProjectId: 'P-2',
      currentView: 'plugin:dev.kvg.jira:query',
    })

    await waitFor(() => expect(invoke).toHaveBeenCalledWith(METHOD.search, {
      jql: 'project = NEXT AND status = Backlog',
      nextPageToken: null,
    }))
  })
})
