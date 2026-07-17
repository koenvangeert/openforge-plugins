import { describe, expect, it } from 'vitest'
import { OPENFORGE_FRONTEND_PLUGIN_MARKER } from '@openforge-app/plugin-sdk/frontend'
import { isOpenForgePackageMetadata } from '@openforge-app/plugin-sdk'
import { createOpenForgeRegistryFake } from '@openforge-app/plugin-sdk/testing'
import plugin from './index'
import { REFRESH_EVENT } from './lib/protocol'
import packageJson from '../package.json'

describe('jira plugin package metadata', () => {
  it('declares valid openforge metadata with the expected capabilities', () => {
    expect(isOpenForgePackageMetadata(packageJson.openforge)).toBe(true)
    expect(packageJson.openforge.id).toBe('dev.kvg.jira')
    expect(packageJson.openforge.icon).toBe('file-text')
    expect(packageJson.openforge.requires).toEqual(
      expect.arrayContaining([
        'backend',
        'commands',
        'events',
        'navigation',
        'settings',
        'storage',
        'system.openUrl',
        'tasks',
        'views',
      ]),
    )
  })
})

describe('jira plugin activation', () => {
  it('registers the view, settings section and refresh command (task-pane tab disabled for now)', async () => {
    const registry = createOpenForgeRegistryFake({ pluginId: 'dev.kvg.jira', projectId: 'P-1' })
    await registry.activateFrontend(plugin)

    expect(plugin[OPENFORGE_FRONTEND_PLUGIN_MARKER]).toBe(true)
    expect(registry.snapshot.views).toMatchObject([{ id: 'query', icon: 'file-text', placement: 'rail' }])
    expect(registry.snapshot.taskPaneTabs).toEqual([])
    expect(registry.snapshot.settingsSections).toMatchObject([{ id: 'credentials' }])
    expect(registry.snapshot.commands).toMatchObject([{ id: 'refresh' }])
  })

  it('emits the refresh event when the command runs', async () => {
    const registry = createOpenForgeRegistryFake({ pluginId: 'dev.kvg.jira', projectId: 'P-1' })
    await registry.activateFrontend(plugin)

    await registry.frontendApi.commands.invoke('refresh')

    expect(registry.calls.emittedEvents.map((e) => e.event)).toContain(REFRESH_EVENT)
  })
})
