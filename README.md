# openforge-plugins

A monorepo for building **OpenForge Trusted Plugins** — `package.json#openforge`
packages that extend the OpenForge desktop app at runtime through the
`@openforge-app/plugin-sdk` contract.

Each plugin lives in its own package under `plugins/`. They share one pinned
toolchain (via a pnpm catalog) and one SDK. The authoritative domain contract
lives in the OpenForge repo:

- `../openforge/docs/plugin-authoring.md` — the human-facing authoring guide
- `../openforge/docs/adr/0002-openforge-plugin-package-runtime.md` — runtime rationale
- `../openforge/packages/plugin-sdk/src/types.ts` — exact TypeScript interfaces

This repo's own glossary is in [`CONTEXT.md`](./CONTEXT.md); decisions specific to
this repo are in [`docs/adr/`](./docs/adr).

## Prerequisites

This repo does **not** vendor or publish the SDK. It links it from a sibling
OpenForge checkout. You need the layout:

```
workspace/tmp/
├── openforge/            <- the OpenForge product repo (provides the SDK)
└── openforge-plugins/    <- this repo
```

`@openforge-app/plugin-sdk` is published to npm, and this repo's own
devDependency tracks `^0.3.1` as the reference contract. The four plugins under
`plugins/` still link the SDK from the sibling checkout, which is why the layout
above is still required to build them; new plugins depend on the published
version instead.

Requirements:

- Node `>=20`
- pnpm `11.5.0` (pinned via `packageManager`)
- A built OpenForge SDK, for the plugins that link it. The SDK's `exports` point
  at `dist/`, so a linked package must be built before those plugins can resolve
  `@openforge-app/plugin-sdk` or its types. Plugins on the published version need
  nothing extra.

## Getting started

```bash
# Builds the SDK in ../openforge, then installs this workspace.
pnpm run setup
```

`setup` is `build:sdk` + `pnpm install`. If the SDK build step fails because the
sibling repo pins a different pnpm version, build it manually instead:

```bash
cd ../openforge && pnpm --filter @openforge-app/plugin-sdk build && cd -
pnpm install
```

Re-run `pnpm run build:sdk` whenever the SDK changes in the OpenForge checkout;
a per-plugin `link:` is a live symlink, so a rebuild is picked up without
reinstalling. Plugins depending on the published SDK ignore all of this.

## Repo layout

```
openforge-plugins/
├── package.json          # private root; workspace scripts (build/test/setup)
├── pnpm-workspace.yaml    # plugins/* members + shared toolchain catalog
├── tsconfig.base.json     # shared TS config; each plugin extends it
├── CONTEXT.md             # glossary (ubiquitous language for this repo)
├── docs/adr/              # decisions specific to this repo
└── plugins/               # one package per plugin
```

## Adding a plugin

Plugins are added by hand (this repo deliberately ships no generator). Use an
OpenForge built-in as a live reference — `../openforge/plugins/demo-hello-world`
(frontend-only) or `../openforge/plugins/github-sync` (frontend + backend).

### 1. Create the package

```bash
mkdir -p plugins/<name>/src
```

### 2. `plugins/<name>/package.json`

`openforge.id` must be unique app-wide. Use the `dev.kvg.*` namespace so it never
collides with core (`com.openforge.*`). Declare only the capabilities you use in
`requires` so OpenForge can validate and explain missing support.

```json
{
  "name": "@kvg/openforge-<name>",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "build": "vite build && vite build --config vite.backend.config.ts",
    "typecheck": "svelte-check --tsconfig ./tsconfig.json",
    "test": "vitest run"
  },
  "dependencies": {
    "@openforge-app/plugin-sdk": "^0.3.1"
  },
  "peerDependencies": {
    "svelte": "^5.0.0"
  },
  "devDependencies": {
    "@sveltejs/vite-plugin-svelte": "catalog:",
    "@testing-library/svelte": "catalog:",
    "@types/node": "catalog:",
    "svelte": "catalog:",
    "svelte-check": "catalog:",
    "typescript": "catalog:",
    "vite": "catalog:",
    "vitest": "catalog:"
  },
  "openforge": {
    "id": "dev.kvg.<name>",
    "apiVersion": 1,
    "displayName": "<Display Name>",
    "description": "<one line>",
    "icon": "plug",
    "frontend": "./dist/frontend.js",
    "backend": "./dist/backend.js",
    "requires": ["views", "commands", "storage"]
  }
}
```

Notes:

- Depend on the published SDK by version. Use
  `link:../../../openforge/packages/plugin-sdk` instead only while co-developing
  the SDK and the plugin together, and remember the plugin then cannot build
  without the sibling checkout.
- Drop `frontend` or `backend` (and the matching vite build) if the plugin only
  needs one runtime. A frontend-only plugin still gets host capabilities like
  `tasks`, `storage`, and `notifications`.
- `apiVersion` is the host compatibility gate; current SDK types expose `1`.

### 3. `plugins/<name>/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

### 4. Vite configs (host-shared Svelte contract)

Frontend plugins **must not bundle their own Svelte** — `PluginSlot` renders the
component inside the host's Svelte tree, so they must share one runtime singleton.
Externalize it with `openforgePluginViteExternals`.

`vite.config.ts` (frontend → `dist/frontend.js`):

```ts
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { openforgePluginViteExternals } from '@openforge-app/plugin-sdk/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [svelte()],
  build: {
    lib: { entry: 'src/frontend.ts', formats: ['es'], fileName: () => 'frontend.js' },
    rollupOptions: { external: openforgePluginViteExternals }
  }
})
```

`vite.backend.config.ts` (backend → `dist/backend.js`, omit if frontend-only):

```ts
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    emptyOutDir: false,
    ssr: 'src/backend.ts',
    outDir: 'dist',
    target: 'node20',
    rollupOptions: { output: { entryFileNames: 'backend.js', format: 'es' } }
  },
  ssr: { noExternal: ['@openforge-app/plugin-sdk'] }
})
```

### 5. Entry points

```ts
// src/frontend.ts
import { defineFrontendPlugin } from '@openforge-app/plugin-sdk/frontend'

export default defineFrontendPlugin({
  activate(openforge, context) {
    context.subscriptions.add(
      openforge.views.register({
        id: '<name>',
        title: '<Display Name>',
        icon: 'plug',
        placement: 'rail',
        component: () => import('./<Name>View.svelte')
      })
    )
  }
})
```

```ts
// src/backend.ts  (omit if frontend-only)
import { defineBackendPlugin } from '@openforge-app/plugin-sdk/backend'

export default defineBackendPlugin({
  activate(openforge, context) {
    context.subscriptions.add(
      openforge.backend.registerMethod('doThing', {
        input: { type: 'object', properties: {} },
        output: { type: 'object', properties: {} },
        handler: async () => ({})
      })
    )
  }
})
```

Register **every** contribution through `context.subscriptions.add(...)` so
deactivation cleans up. `activate()` does not return a cleanup function.

### 6. Test

```ts
// src/<name>.test.ts
import { describe, expect, it } from 'vitest'
import plugin from './frontend'
import { createOpenForgeRegistryFake } from '@openforge-app/plugin-sdk/testing'

describe('activation', () => {
  it('registers the view', async () => {
    const registry = createOpenForgeRegistryFake({ pluginId: 'dev.kvg.<name>', projectId: 'P-1' })
    await registry.activateFrontend(plugin)
    expect(registry.snapshot.views).toMatchObject([{ id: '<name>' }])
  })
})
```

### 7. Wire it in

```bash
pnpm install            # picks up the new workspace package + SDK link
pnpm --filter @kvg/openforge-<name> build
pnpm --filter @kvg/openforge-<name> test
```

## Build & test everything

```bash
pnpm run build      # pnpm -r run build
pnpm run test       # pnpm -r run test
pnpm run typecheck  # pnpm -r run typecheck
```

## Installing a plugin into OpenForge

OpenForge installs **already-built** plugins; it does not compile source on
install. After `pnpm --filter @kvg/openforge-<name> build` produces `dist/`,
install it as a local path source (OpenForge supports `npm:`, `git:`, and local
path sources):

```
/absolute/path/to/openforge-plugins/plugins/<name>
```

Install is app-wide. Enablement is per project by default: accept the "Enable for
this project?" prompt. A plugin declaring `openforge.enablement: "app"` is instead
enabled once for the whole app (`openforge plugin app enable --plugin-id <id>`).
Use OpenForge's plugin reload action after rebuilding.

## What plugins may and may not do

- Import only `@openforge-app/plugin-sdk` (and `/frontend`, `/backend`, `/testing`,
  `/vite`) plus normal npm deps. Never import OpenForge renderer stores, Electron/
  preload APIs, Rust internals, or app IPC wrappers.
- Storage is JSON-only, auto-namespaced by plugin id; pick the narrowest scope
  (`storage.task` / `storage.project` / `storage.global`).
- Scheduler-style plugins use `openforge.tasks.create` / `tasks.startImplementation`
  — never shell out to the OpenForge CLI from plugin code.
- Frontend-only registries: `views`, `taskPane`, `settings`, `navigation`.
  Backend-only registries: `backend.registerMethod`, `background.register`.
