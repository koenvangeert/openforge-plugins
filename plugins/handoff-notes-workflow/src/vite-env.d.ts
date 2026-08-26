/// <reference types="vite/client" />

// Allow importing Svelte single-file components from `.ts` under `tsc`.
declare module '*.svelte' {
  import type { Component } from 'svelte'

  const component: Component<Record<string, unknown>>
  export default component
}
