import type { InstalledAiProvider } from '@openforge-app/plugin-sdk'
import type { FrontendOpenForgeAPI } from '@openforge-app/plugin-sdk/frontend'
import type { Injectable, Snippet } from './injectableDomain'
import type { LocalSkillRecord } from './skillDomain'
import { buildInjectables, type BrowseMode } from './injectables'
import { METHOD } from './protocol'

/** The slice of the plugin API the injectable catalog needs: the host command
 * catalog and the plugin backend (where snippets and local skills live). */
export type CatalogApi = Pick<FrontendOpenForgeAPI, 'commands' | 'backend'>

export async function loadInjectableCatalog(
  api: CatalogApi,
  projectId: string | null,
  mode: BrowseMode = 'insert',
  provider: string | null = null,
  installedProviders: readonly InstalledAiProvider[] = [],
): Promise<{ injectables: Injectable[]; snippets: Snippet[] }> {
  await api.backend.whenReady()
  const [commands, snippets, localSkills] = await Promise.all([
    api.commands.listCatalog({ projectId }),
    api.backend.invoke<Snippet[]>(METHOD.listSnippets, null),
    api.backend.invoke<LocalSkillRecord[]>(METHOD.listLocalSkills, { projectId }),
  ])
  return {
    injectables: buildInjectables({
      commands,
      localSkills,
      snippets,
      projectId,
      mode,
      provider,
      installedProviders,
    }),
    snippets,
  }
}
