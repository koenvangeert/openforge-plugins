import { describe, expect, it } from 'vitest'
import { createOpenForgeRegistryFake } from '@openforge-app/plugin-sdk/testing'
import { isOpenForgePackageMetadata } from '@openforge-app/plugin-sdk'
import { OPENFORGE_FRONTEND_PLUGIN_MARKER } from '@openforge-app/plugin-sdk/frontend'
import packageJson from '../package.json'
import plugin from './frontend'
import { PACKAGE_METADATA } from './testMetadata'

describe('claude-usage metadata', () => {
  it('has valid package.json#openforge metadata', () => {
    expect(isOpenForgePackageMetadata(packageJson.openforge)).toBe(true)
    expect(packageJson.openforge.id).toBe('dev.kvg.claude-usage')
  })

  it('is app-enabled, because one figure spanning every project cannot be enabled per project', () => {
    expect(packageJson.openforge.enablement).toBe('app')
    expect(packageJson.openforge.requires).toContain('appEnablement')
  })

  it('declares the capabilities the sidebar view and transcript indexer depend on', () => {
    expect(packageJson.openforge.requires).toEqual(
      expect.arrayContaining([
        'views',
        'customSidebarNavigation',
        'backend',
        'background',
        'fs',
        'tasks',
        'projects',
        'taskPane',
      ]),
    )
  })

  it('declares the stylesheet the frontend build will emit', () => {
    const emitted = `./dist/${packageJson.name.split('/').pop()}.css`

    expect(packageJson.openforge.frontendStyles).toEqual([emitted])
  })

  it('declares the capabilities the configurable rescan interval depends on', () => {
    expect(packageJson.openforge.requires).toEqual(expect.arrayContaining(['settings', 'storage']))
  })

  it('claims no capability it cannot use, so the host has nothing spurious to validate', () => {
    expect(packageJson.openforge.requires).not.toContain('commands')
    expect(packageJson.openforge.requires).not.toContain('notifications')
  })
})

describe('claude-usage frontend activation', () => {
  it('registers the dashboard in the cross-project sidebar rather than the per-project rail', async () => {
    const registry = createOpenForgeRegistryFake({
      pluginId: packageJson.openforge.id,
      projectId: null,
      packageMetadata: PACKAGE_METADATA,
    })

    await registry.activateFrontend(plugin)

    expect(plugin[OPENFORGE_FRONTEND_PLUGIN_MARKER]).toBe(true)
    expect(registry.snapshot.views).toMatchObject([
      { id: 'usage', title: 'Claude usage', placement: 'sidebar', icon: 'chart-column-big' },
    ])
  })

  it('sorts below every plugin taking the host default order of 100', async () => {
    const registry = createOpenForgeRegistryFake({
      pluginId: packageJson.openforge.id,
      projectId: null,
      packageMetadata: PACKAGE_METADATA,
    })

    await registry.activateFrontend(plugin)

    expect(registry.snapshot.views[0]!.order).toBeGreaterThan(100)
  })

  it('owns its sidebar navigation slot so the row can carry a live figure', async () => {
    const registry = createOpenForgeRegistryFake({
      pluginId: packageJson.openforge.id,
      projectId: null,
      packageMetadata: PACKAGE_METADATA,
    })

    await registry.activateFrontend(plugin)

    expect(registry.snapshot.views[0]!.navigationComponent).toBeTypeOf('function')
  })

  it('offers the rescan interval on the global settings page, not per project', async () => {
    const registry = createOpenForgeRegistryFake({
      pluginId: packageJson.openforge.id,
      projectId: null,
      packageMetadata: PACKAGE_METADATA,
    })

    await registry.activateFrontend(plugin)

    expect(registry.snapshot.settingsSections).toMatchObject([{ id: 'rescan-interval', scope: 'global' }])
  })

  it('adds a spend section to every task detail stack', async () => {
    const registry = createOpenForgeRegistryFake({
      pluginId: packageJson.openforge.id,
      projectId: null,
      packageMetadata: PACKAGE_METADATA,
    })

    await registry.activateFrontend(plugin)

    expect(registry.snapshot.taskUISections).toMatchObject([{ id: 'task-spend' }])
  })

  it('orders the task section past the host Changes split and every other plugin section', async () => {
    const registry = createOpenForgeRegistryFake({
      pluginId: packageJson.openforge.id,
      projectId: null,
      packageMetadata: PACKAGE_METADATA,
    })

    await registry.activateFrontend(plugin)

    expect(registry.snapshot.taskUISections[0]!.order).toBeGreaterThan(90)
  })

  it('registers the view through subscriptions so deactivation removes it', async () => {
    const registry = createOpenForgeRegistryFake({
      pluginId: packageJson.openforge.id,
      projectId: null,
      packageMetadata: PACKAGE_METADATA,
    })
    await registry.activateFrontend(plugin)

    await registry.disposeAll()

    expect(registry.snapshot.views).toEqual([])
    expect(registry.snapshot.taskUISections).toEqual([])
  })
})

describe('claude-usage chart colours', () => {
  it('names theme variables rather than utility classes, because the host only compiles the utilities it uses itself', async () => {
    const { CHART_SERIES } = await import('./dailyChartConfig')

    expect(CHART_SERIES.map((entry) => entry.cssVariable)).toEqual([
      '--color-info',
      '--color-accent',
      '--color-primary',
      '--color-secondary',
    ])
  })

  it('keeps every series out of the host stylesheet, so a purged class cannot blank a bar', async () => {
    const { readFileSync } = await import('node:fs')
    const { dirname, join } = await import('node:path')
    const { fileURLToPath } = await import('node:url')
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'dailyChartConfig.ts'), 'utf8')

    expect(source).not.toMatch(/\bbg-(info|accent|primary|secondary)\b/)
  })
})
