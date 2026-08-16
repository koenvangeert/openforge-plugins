import { describe, it, expect } from 'vitest'
import { createOpenForgeRegistryFake } from '@openforge-app/plugin-sdk/testing'
import plugin from './index'

describe('injectables plugin activation', () => {
  it('registers the Injectables rail view', async () => {
    const registry = createOpenForgeRegistryFake({ pluginId: 'com.openforge.injectables', projectId: 'P-1' })
    await registry.activateFrontend(plugin)
    expect(registry.getSnapshot().views).toContainEqual(expect.objectContaining({ id: 'injectables' }))
  })

  it('registers the injection-point picker at all three locations', async () => {
    const registry = createOpenForgeRegistryFake({ pluginId: 'com.openforge.injectables', projectId: 'P-1' })
    await registry.activateFrontend(plugin)
    expect(registry.getSnapshot().injectionPoints).toEqual(
      expect.arrayContaining([
        { id: 'picker-createTaskPrompt', location: 'createTaskPrompt' },
        { id: 'picker-agentSession', location: 'agentSession' },
        { id: 'picker-backlogPrompt', location: 'backlogPrompt' },
      ]),
    )
  })

  it('registers a task-start prefix provider', async () => {
    const registry = createOpenForgeRegistryFake({ pluginId: 'com.openforge.injectables', projectId: 'P-1' })
    await registry.activateFrontend(plugin)
    expect(registry.getSnapshot().taskStartPrefixProviders).toEqual([
      expect.objectContaining({ id: 'injectable', title: 'Start with injectable…', order: 10 }),
    ])
  })
})
