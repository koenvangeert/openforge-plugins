import { createOpenForgeRegistryFake } from '@openforge-app/plugin-sdk/testing'
import { OPENFORGE_FRONTEND_PLUGIN_MARKER } from '@openforge-app/plugin-sdk/frontend'
import { describe, expect, it, vi } from 'vitest'
import packageJson from '../package.json'
import { agentSession } from './__fixtures__/agentSession'

const components = vi.hoisted(() => ({ settings: vi.fn(), taskPane: vi.fn() }))
vi.mock('./PrLensSettings.svelte', () => ({ default: components.settings }))
vi.mock('./PrLensTaskPane.svelte', () => ({ default: components.taskPane }))

const PROJECT_ID = 'P-8'
const TASK_ID = 'KVG-1'

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

async function activate(agentSessions = [agentSession('S-1', TASK_ID, 1)]) {
  const { default: plugin } = await import('./frontend')
  const registry = createOpenForgeRegistryFake({
    pluginId: packageJson.openforge.id,
    projectId: PROJECT_ID,
    taskId: TASK_ID,
    agentSessions,
  })
  await registry.activateFrontend(plugin)
  await settle()
  return registry
}

describe('PR Lens frontend plugin', () => {
  it('declares the frontend and backend artifacts the manifest promises', () => {
    expect(packageJson).toMatchObject({
      openforge: {
        id: 'dev.kvg.pr-lens',
        apiVersion: 1,
        frontend: './dist/frontend.js',
        backend: './dist/backend.js',
        frontendStyles: ['./dist/plugin-pr-lens.css'],
      },
    })
  })

  it('registers the prompt settings section for the project scope', async () => {
    const registry = await activate()
    const { PR_LENS_SETTINGS_SECTION_ID } = await import('./frontend')

    expect(registry.snapshot.settingsSections).toMatchObject([
      {
        id: PR_LENS_SETTINGS_SECTION_ID,
        title: 'PR Lens',
        order: 90,
        scope: 'project',
        component: components.settings,
      },
    ])
  })

  it('registers the task tab without requiring a resolved workspace', async () => {
    const registry = await activate()
    const { PR_LENS_TAB_ID, default: plugin } = await import('./frontend')

    expect(plugin[OPENFORGE_FRONTEND_PLUGIN_MARKER]).toBe(true)
    expect(registry.snapshot.taskPaneTabs).toMatchObject([
      {
        id: PR_LENS_TAB_ID,
        title: 'PR Lens',
        icon: 'workflow',
        order: 80,
        requiresWorkspace: false,
        component: components.taskPane,
        pluginId: packageJson.openforge.id,
        projectId: PROJECT_ID,
      },
    ])
  })

  it('keeps the tab on a task that never ran, where the pane explains itself', async () => {
    const registry = await activate([])

    expect(registry.snapshot.taskPaneTabs).toHaveLength(1)
  })

  it('leaves nothing registered after deactivation', async () => {
    const registry = await activate()

    await registry.disposeAll()

    expect(registry.snapshot.taskPaneTabs).toEqual([])
    expect(registry.snapshot.settingsSections).toEqual([])
    expect(registry.snapshot.commands).toEqual([])
  })
})
