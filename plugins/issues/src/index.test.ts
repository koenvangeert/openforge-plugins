import { describe, expect, it, vi } from 'vitest'
import { OPENFORGE_FRONTEND_PLUGIN_MARKER } from '@openforge-app/plugin-sdk/frontend'
import { isOpenForgePackageMetadata } from '@openforge-app/plugin-sdk'
import type { FrontendOpenForgeAPI, FrontendPluginContext } from '@openforge-app/plugin-sdk/frontend'
import type { BackendOpenForgeAPI, BackendPluginContext } from '@openforge-app/plugin-sdk/backend'

const { mockIssuesView, mockLinkedIssuePane, mockSettingsSection } = vi.hoisted(() => ({
  mockIssuesView: { name: 'IssuesViewComponent' },
  mockLinkedIssuePane: { name: 'LinkedIssuePaneComponent' },
  mockSettingsSection: { name: 'IssuesSettingsSectionComponent' },
}))

vi.mock('./components/IssuesView.svelte', () => ({
  default: mockIssuesView,
}))

vi.mock('./components/LinkedIssuePane.svelte', () => ({
  default: mockLinkedIssuePane,
}))

vi.mock('./components/SettingsSection.svelte', () => ({
  default: mockSettingsSection,
}))

import packageJson from '../package.json'

function makeFrontendHarness() {
  const subscriptions = { add: vi.fn() }
  const api = {
    views: { register: vi.fn(() => ({ dispose: vi.fn() })) },
    taskPane: { registerTab: vi.fn(() => ({ dispose: vi.fn() })) },
    settings: { registerSection: vi.fn(() => ({ dispose: vi.fn() })) },
  } as unknown as FrontendOpenForgeAPI
  const context = {
    pluginId: packageJson.openforge.id,
    apiVersion: 1,
    packageMetadata: packageJson.openforge,
    subscriptions,
  } as FrontendPluginContext
  return { api, context, subscriptions }
}

describe('issues plugin metadata', () => {
  it('has valid package.json#openforge metadata', () => {
    expect(isOpenForgePackageMetadata(packageJson.openforge)).toBe(true)
    expect(packageJson.openforge.id).toBe('com.openforge.issues')
    expect(packageJson.openforge.icon).toBe('kanban')
    expect(packageJson.openforge.frontend).toBe('./dist/frontend.js')
    expect(packageJson.openforge.backend).toBe('./dist/backend.js')
    expect(packageJson.openforge.requires).toEqual(
      expect.arrayContaining(['views', 'taskPane', 'backend', 'tasks', 'projectConfig', 'storage', 'system.openUrl', 'context']),
    )
  })

  // Refine reads its API key from a settings section and grounds drafts in the
  // project's README, neither of which the plugin can do uncapability'd.
  it('declares the settings and fs capabilities that Refine depends on', () => {
    expect(packageJson.openforge.requires).toEqual(expect.arrayContaining(['settings', 'fs']))
  })

  // The board resolves the repo itself and reads the token OpenForge already holds,
  // so it needs both. As an external plugin it is NOT on the host's global-command
  // allowlist, which is why nothing here may proxy to core.
  it('declares the capabilities the self-contained GitHub path needs', () => {
    expect(packageJson.openforge.requires).toEqual(expect.arrayContaining(['config', 'projects']))
    expect(packageJson.openforge.requires).not.toContain('commands')
  })

  // Board.svelte styles its masonry columns in a <style> block. As a built-in that
  // CSS rode along in the app bundle; as an external plugin the host only injects
  // stylesheets the manifest names, so an undeclared one silently breaks the layout.
  //
  // Asserted against the name Vite derives from the package name rather than against
  // dist/, which is gitignored and which `pnpm test` does not build — reading it would
  // make this red on a clean checkout and vacuously green next to a stale build.
  it('declares the stylesheet the frontend build will emit', () => {
    const emitted = `./dist/${packageJson.name.split('/').pop()}.css`

    expect(packageJson.openforge.frontendStyles).toEqual([emitted])
  })
})

describe('issues frontend plugin', () => {
  it('registers a settings section so the API key has somewhere to live', async () => {
    const { default: plugin, IssuesSettingsSectionComponent } = await import('./index')
    const { api, context } = makeFrontendHarness()

    await plugin.activate(api, context)

    expect(api.settings.registerSection).toHaveBeenCalledWith(
      // scope: 'global' puts the API key field in the plugin's card on the global
      // settings page, not on a per-project page.
      expect.objectContaining({ id: 'issues-settings', scope: 'global', component: IssuesSettingsSectionComponent }),
    )
  })

  it('registers the Issues rail view with a non-colliding Cmd shortcut', async () => {
    const { default: plugin, IssuesViewComponent, LinkedIssuePaneComponent } = await import('./index')
    const { api, context, subscriptions } = makeFrontendHarness()

    await plugin.activate(api, context)

    expect(plugin[OPENFORGE_FRONTEND_PLUGIN_MARKER]).toBe(true)
    expect(api.views.register).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'issues',
        title: 'Issues',
        icon: 'kanban',
        placement: 'rail',
        order: 21,
        shortcut: 'Cmd+R',
        component: IssuesViewComponent,
      }),
    )
    // Must not collide with the reserved app/plugin shortcuts.
    const reserved = ['Cmd+H', 'Cmd+G', 'Cmd+L', 'Cmd+,']
    const registration = (api.views.register as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(reserved).not.toContain(registration.shortcut)
    expect(api.taskPane.registerTab).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'issue',
        title: 'Linked issue',
        icon: 'ticket',
        order: 30,
        component: LinkedIssuePaneComponent,
      }),
    )
    expect(subscriptions.add).toHaveBeenCalledWith(expect.objectContaining({ dispose: expect.any(Function) }))
  })

  it('reaches core only through api.backend.invoke (no raw transport)', async () => {
    const { readFileSync } = await import('node:fs')
    const { dirname, join } = await import('node:path')
    const { fileURLToPath } = await import('node:url')
    const srcDir = dirname(fileURLToPath(import.meta.url))
    const viewSource = readFileSync(join(srcDir, 'components/IssuesView.svelte'), 'utf8')
    const clientSource = readFileSync(join(srcDir, 'lib/issuesClient.ts'), 'utf8')

    expect(viewSource).not.toContain('lib/ipc')
    expect(clientSource).toContain('api.backend.invoke')
    expect(clientSource).toContain("'issues_get_board'")
    expect(clientSource).toContain("'issues_update_label_color'")
    expect(clientSource).toContain("'issues_refine_ticket'")
  })
})

describe('issues backend plugin', () => {
  it('registers every board method and subscribes each one for disposal', async () => {
    const { default: backend } = await import('./backend')
    const subscriptions = { add: vi.fn() }
    const api = {
      backend: { registerMethod: vi.fn(() => ({ dispose: vi.fn() })) },
    } as unknown as BackendOpenForgeAPI
    const context = {
      pluginId: packageJson.openforge.id,
      apiVersion: 1,
      packageMetadata: packageJson.openforge,
      subscriptions,
    } as BackendPluginContext

    await backend.activate(api, context)

    const methods = ['issues_get_board', 'issues_set_value', 'issues_get_config', 'issues_set_column_labels', 'issues_create_issue', 'issues_edit_issue', 'issues_update_label_color', 'issues_refine_ticket']
    for (const method of methods) {
      expect(api.backend.registerMethod).toHaveBeenCalledWith(method, expect.objectContaining({ handler: expect.any(Function) }))
    }
    expect(subscriptions.add).toHaveBeenCalledTimes(8)
  })

  // The board talks to GitHub itself; no method may fall back to invoking a core
  // command, because an external plugin is not on the host's invoke allowlist.
  it('handles issues_refine_ticket in-plugin without reaching a host command', async () => {
    const { default: backend } = await import('./backend')
    const invokeGlobal = vi.fn(() => Promise.resolve(null))
    const api = {
      backend: { registerMethod: vi.fn(() => ({ dispose: vi.fn() })) },
      commands: { invokeGlobal },
      storage: { global: { get: vi.fn().mockResolvedValue(null), set: vi.fn(), delete: vi.fn() } },
      fs: { readFile: vi.fn().mockRejectedValue(new Error('no readme')) },
    } as unknown as BackendOpenForgeAPI
    const context = {
      pluginId: packageJson.openforge.id,
      apiVersion: 1,
      packageMetadata: packageJson.openforge,
      subscriptions: { add: vi.fn() },
    } as unknown as BackendPluginContext

    await backend.activate(api, context)

    const registerCalls = (api.backend.registerMethod as ReturnType<typeof vi.fn>).mock.calls
    const refineTicket = registerCalls.find((c) => c[0] === 'issues_refine_ticket')![1] as {
      handler: (p: unknown) => Promise<unknown>
    }

    // No key configured, so it fails before any request — the point is where it stops.
    await expect(
      refineTicket.handler({ projectId: 'P-1', repo: 'acme/app', repoLabels: [], text: 'rough idea', draft: null, feedback: '' }),
    ).rejects.toThrow(/global settings/)

    expect(invokeGlobal).not.toHaveBeenCalledWith('openforge.roadmapRefineTicket', expect.anything())
  })
})
