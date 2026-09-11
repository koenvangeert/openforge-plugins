import { describe, expect, it } from 'vitest'
import { isOpenForgePackageMetadata } from '@openforge-app/plugin-sdk'
import { OPENFORGE_FRONTEND_PLUGIN_MARKER } from '@openforge-app/plugin-sdk/frontend'
import { createOpenForgeRegistryFake } from '@openforge-app/plugin-sdk/testing'
import plugin from './index'
import packageJson from '../package.json'

describe('task-map plugin package metadata', () => {
  it('declares valid openforge metadata with the expected capabilities', () => {
    expect(isOpenForgePackageMetadata(packageJson.openforge)).toBe(true)
    expect(packageJson.openforge.id).toBe('dev.kvg.task-map')
    expect(packageJson.openforge.requires).toEqual([
      'context',
      'navigation',
      'storage',
      'tasks',
      'views',
    ])
  })

  it('declares a frontend bundle and its stylesheet and no backend', () => {
    expect(packageJson.openforge.frontend).toBe('./dist/frontend.js')
    expect(packageJson.openforge.frontendStyles).toEqual(['./dist/plugin-task-map.css'])
    expect(packageJson.openforge).not.toHaveProperty('backend')
  })
})

describe('task-map plugin activation', () => {
  it('registers the Task Map rail view', async () => {
    const registry = createOpenForgeRegistryFake({ pluginId: 'dev.kvg.task-map', projectId: 'P-1' })

    await registry.activateFrontend(plugin)

    expect(plugin[OPENFORGE_FRONTEND_PLUGIN_MARKER]).toBe(true)
    expect(registry.snapshot.views).toMatchObject([
      {
        id: 'map',
        qualifiedId: 'dev.kvg.task-map.map',
        title: 'Task Map',
        icon: 'boxes',
        placement: 'rail',
      },
    ])
  })

  it('contributes nothing but the view', async () => {
    const registry = createOpenForgeRegistryFake({ pluginId: 'dev.kvg.task-map', projectId: 'P-1' })

    await registry.activateFrontend(plugin)

    expect(registry.snapshot.commands).toEqual([])
    expect(registry.snapshot.taskPaneTabs).toEqual([])
    expect(registry.snapshot.taskUISections).toEqual([])
    expect(registry.snapshot.settingsSections).toEqual([])
    expect(registry.snapshot.backendMethods).toEqual([])
  })

  it('removes the view on disposal', async () => {
    const registry = createOpenForgeRegistryFake({ pluginId: 'dev.kvg.task-map', projectId: 'P-1' })
    await registry.activateFrontend(plugin)

    await registry.disposeAll()

    expect(registry.snapshot.views).toEqual([])
  })
})
