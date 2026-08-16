import { mount, unmount } from 'svelte'
import type { FrontendOpenForgeAPI } from '@openforge-app/plugin-sdk/frontend'
import InjectablePicker from '../InjectablePicker.svelte'
import type { Injectable } from './injectableDomain'

/**
 * Summons the picker from outside any mounted plugin surface — a board context
 * menu item, for instance — and resolves with the chosen invocation text, or
 * null if the user backs out.
 *
 * Mounting standalone is safe because the host and its plugins share one Svelte
 * instance through the renderer import map, so this tree is a peer of the host's
 * rather than an orphan.
 */
export function pickInjectable(
  api: FrontendOpenForgeAPI,
  projectId: string | null,
): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    const host = document.createElement('div')
    host.setAttribute('data-injectable-picker-host', '')
    document.body.appendChild(host)

    let settled = false
    let instance: Record<string, unknown> | null = null

    // Selecting also closes, so the picker reports both. First answer wins.
    const settle = (value: string | null) => {
      if (settled) return
      settled = true
      resolve(value)
      // Deferred: this runs from inside the picker's own event handler, and
      // unmounting a component mid-handler tears down the tree it is dispatching in.
      queueMicrotask(() => {
        if (instance) void unmount(instance)
        host.remove()
      })
    }

    instance = mount(InjectablePicker, {
      target: host,
      props: {
        api,
        projectId,
        open: true,
        onClose: () => settle(null),
        onSelect: (injectable: Injectable) => settle(injectable.invocationText),
      },
    }) as Record<string, unknown>
  })
}
