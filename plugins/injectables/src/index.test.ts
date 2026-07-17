import { describe, it, expect } from 'vitest'
import { createOpenForgeRegistryFake } from '@openforge-app/plugin-sdk/testing'
import plugin from './index'

describe('injectables plugin activation', () => {
  it('activates without registering contributions yet', async () => {
    const registry = createOpenForgeRegistryFake({ pluginId: 'com.openforge.injectables', projectId: 'P-1' })
    await registry.activateFrontend(plugin)
    expect(registry.getSnapshot().views).toEqual([])
  })
})
