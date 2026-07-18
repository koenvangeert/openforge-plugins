import type { Injectable, Snippet } from './injectableDomain'
import type { FrontendOpenForgeAPI } from '@openforge-app/plugin-sdk/frontend'
import { buildInjectables } from './injectables'
import { METHOD } from './protocol'

/** The slice of the plugin API the injectable catalog needs: the host command
 * catalog and the plugin backend (where snippets live). */
export type CatalogApi = Pick<FrontendOpenForgeAPI, 'commands' | 'backend'>

/**
 * Load the injectable catalog for the Skills tab: the host's Claude
 * skills/commands catalog (via `commands.listCatalog`) merged with the user's
 * personal snippets (from the plugin backend's snippet store), mapped into the
 * shared `Injectable` view model. Snippets are filtered to the active project
 * inside `buildInjectables`; a null project yields only all-projects snippets.
 */
export async function loadInjectableCatalog(
  api: CatalogApi,
  projectId: string | null,
): Promise<{ injectables: Injectable[]; snippets: Snippet[] }> {
  await api.backend.whenReady()
  const [commands, snippets] = await Promise.all([
    api.commands.listCatalog({ projectId }),
    api.backend.invoke<Snippet[]>(METHOD.listSnippets, null),
  ])
  return { injectables: buildInjectables({ commands, snippets, projectId }), snippets }
}
