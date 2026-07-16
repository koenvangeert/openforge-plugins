/// <reference types="vite/client" />

// Allow importing Svelte single-file components from `.ts` under `tsc`. The
// permissive `Component<any>` keeps the runtime registration types happy while
// the real prop typing lives inside each `.svelte` file.
declare module '*.svelte' {
  import type { Component } from 'svelte'
  const component: Component<any>
  export default component
}
