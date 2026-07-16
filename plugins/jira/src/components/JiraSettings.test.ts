// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import type { JsonValue } from '@openforge-app/plugin-sdk'
import type { FrontendOpenForgeAPI } from '@openforge-app/plugin-sdk/frontend'
import { createOpenForgeRegistryFake } from '@openforge-app/plugin-sdk/testing'
import { describe, expect, it } from 'vitest'
import backendPlugin from '../backend'
import { GLOBAL_KEY } from '../lib/protocol'
import JiraSettings from './JiraSettings.svelte'

describe('JiraSettings', () => {
  it('loads and saves through the backend without reading credential storage in the renderer', async () => {
    const registry = createOpenForgeRegistryFake({ pluginId: 'dev.kvg.jira', projectId: 'P-1' })
    await registry.storage.global.set(GLOBAL_KEY.credentials, {
      site: 'https://acme.atlassian.net',
      email: 'me@acme.com',
      apiToken: 'stored-token',
    })
    await registry.activateBackend(backendPlugin)

    const rendererGets: string[] = []
    const rendererSets: string[] = []
    const api: FrontendOpenForgeAPI = {
      ...registry.frontendApi,
      storage: {
        ...registry.frontendApi.storage,
        global: {
          get: async <T extends JsonValue = JsonValue>(key: string): Promise<T | null> => {
            rendererGets.push(key)
            return registry.storage.global.get<T>(key)
          },
          set: async <T extends JsonValue = JsonValue>(key: string, value: T): Promise<void> => {
            rendererSets.push(key)
            return registry.storage.global.set(key, value)
          },
          delete: registry.storage.global.delete.bind(registry.storage.global),
        },
      },
    }

    render(JiraSettings, {
      props: { api, context: api.context.getSnapshot() },
    })

    const siteInput = screen.getByLabelText('Site') as HTMLInputElement
    await waitFor(() => expect(siteInput.value).toBe('https://acme.atlassian.net'))
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('me@acme.com')

    await fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('Saved.')

    expect(rendererGets).toEqual([])
    expect(rendererSets).toEqual([])
    await expect(registry.storage.global.get(GLOBAL_KEY.credentials)).resolves.toMatchObject({
      apiToken: 'stored-token',
    })
  })
})
