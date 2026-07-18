import { loadInjectableCatalog, type CatalogApi } from './injectableCatalog'
import type { Injectable, Snippet } from './injectableDomain'

/**
 * Reactive loader for the injectable catalog, used by the injectable picker dialog.
 * Delegates the actual fetch (host command catalog + plugin-backend snippets, merged
 * into the shared `Injectable` view model) to `loadInjectableCatalog` so the fetch
 * sequence lives in one place, not duplicated between the Skills tab and the picker.
 */
export function useInjectableCatalog(getApi: () => CatalogApi, getProjectId: () => string | null) {
  let injectables = $state<Injectable[]>([])
  let snippets = $state<Snippet[]>([])
  let loading = $state(false)
  let error = $state<string | null>(null)

  async function reload(): Promise<void> {
    loading = true
    error = null
    try {
      const result = await loadInjectableCatalog(getApi(), getProjectId())
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
