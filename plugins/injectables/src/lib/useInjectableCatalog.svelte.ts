import type { InstalledAiProvider } from '@openforge-app/plugin-sdk'
import { loadInjectableCatalog, type CatalogApi } from './injectableCatalog'
import type { Injectable, Snippet } from './injectableDomain'
import type { BrowseMode } from './injectables'

export function useInjectableCatalog(
  getApi: () => CatalogApi,
  getProjectId: () => string | null,
  getMode: () => BrowseMode = () => 'insert',
  getProvider: () => string | null = () => null,
  getInstalledProviders: () => readonly InstalledAiProvider[] = () => [],
) {
  let injectables = $state<Injectable[]>([])
  let snippets = $state<Snippet[]>([])
  let loading = $state(false)
  let error = $state<string | null>(null)

  async function reload(): Promise<void> {
    loading = true
    error = null
    try {
      const result = await loadInjectableCatalog(
        getApi(),
        getProjectId(),
        getMode(),
        getProvider(),
        getInstalledProviders(),
      )
      injectables = result.injectables
      snippets = result.snippets
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
      injectables = []
      snippets = []
    } finally {
      loading = false
    }
  }

  return {
    get injectables() {
      return injectables
    },
    get snippets() {
      return snippets
    },
    get loading() {
      return loading
    },
    get error() {
      return error
    },
    reload,
  }
}
