import { createOpenForgeRegistryFake } from '@openforge-app/plugin-sdk/testing'
import { OPENFORGE_FRONTEND_PLUGIN_MARKER } from '@openforge-app/plugin-sdk/frontend'
import { describe, expect, it, vi } from 'vitest'
import packageJson from '../package.json'

const components = vi.hoisted(() => ({
  settings: vi.fn(),
  taskPane: vi.fn(),
  taskSection: vi.fn(),
}))

vi.mock('./HandoffNotesSettings.svelte', () => ({ default: components.settings }))
vi.mock('./HandoffNotesTaskPane.svelte', () => ({ default: components.taskPane }))
vi.mock('./HandoffNotesTaskSection.svelte', () => ({ default: components.taskSection }))

describe('Handoff Notes Workflow plugin package', () => {
  it('declares frontend and backend artifacts with the required capabilities', () => {
    expect(packageJson).toMatchObject({
      name: '@openforge/plugin-handoff-notes-workflow',
      version: '0.1.0',
      openforge: {
        id: 'com.openforge.handoff-notes-workflow',
        apiVersion: 1,
        frontend: './dist/frontend.js',
        backend: './dist/backend.js',
        frontendStyles: ['./dist/plugin-handoff-notes-workflow.css'],
        requires: [
          'taskPane',
          'commands',
          'tasks',
          'events',
          'storage',
          'projectConfig',
          'system.openUrl',
          'settings',
        ],
      },
    })
  })

  it('registers read-only Handoff Notes task UI and project settings', async () => {
    const { default: plugin } = await import('./frontend')
    const registry = createOpenForgeRegistryFake({
      pluginId: packageJson.openforge.id,
      projectId: 'P-8',
      taskId: 'KVG-1808',
    })

    await registry.activateFrontend(plugin)

    const contributions = await registry.frontendApi.tasks.listStartPromptContributions('P-8')
    expect(contributions).toHaveLength(1)
    expect(contributions[0]).toMatchObject({
      id: 'handoff-notes-workflow',
      enabled: true,
      order: 0,
    })
    expect(contributions[0]?.content).toContain('## Open Questions')
    expect(contributions[0]?.content).toContain('update-handoff-notes')

    expect(plugin[OPENFORGE_FRONTEND_PLUGIN_MARKER]).toBe(true)
    expect(registry.snapshot.commands).toEqual([])
    expect(registry.snapshot.taskPaneTabs).toMatchObject([
      {
        id: 'handoff-notes',
        title: 'Handoff Notes',
        icon: 'notebook-pen',
        order: 90,
        component: components.taskPane,
        pluginId: packageJson.openforge.id,
        projectId: 'P-8',
      },
    ])
    expect(registry.snapshot.taskUISections).toMatchObject([
      {
        id: 'handoff-notes',
        order: 90,
        component: components.taskSection,
        pluginId: packageJson.openforge.id,
        projectId: 'P-8',
      },
    ])
    expect(registry.snapshot.settingsSections).toMatchObject([
      {
        id: 'handoff-notes-workflow',
        title: 'Handoff Notes Workflow',
        order: 90,
        component: components.settings,
      },
    ])

    await registry.disposeAll()
    expect(registry.snapshot.taskPaneTabs).toEqual([])
    expect(registry.snapshot.taskUISections).toEqual([])
    expect(registry.snapshot.settingsSections).toEqual([])
  })
})
