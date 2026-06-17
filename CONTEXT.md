# Context: openforge-plugins

The ubiquitous language for **this repository**. This is a glossary, not a spec —
no implementation details belong here.

The domain of OpenForge itself (Task, Project, Implementation Run, Trusted Plugin,
Capability, Terminal Runtime, …) is owned upstream by
`../openforge/CONTEXT.md`. That file is the source of truth for product language;
the entries below cover only terms specific to authoring plugins in this monorepo.

## Glossary

**Plugin**:
A single OpenForge Trusted Plugin authored in this repo, living as one package
under `plugins/`. Synonymous with OpenForge's **Trusted Plugin** — a trusted app
extension declared in `package.json#openforge`, not a sandboxed third-party widget.
_Avoid_: extension, add-on, Claude Code plugin (a different, unrelated plugin
system), marketplace package.

**Plugin Id**:
The app-wide-unique identifier in `package.json#openforge.id`. Plugins in this repo
use the `dev.kvg.*` reverse-DNS namespace. Distinct from the npm **Package Name**
(`@kvg/openforge-<name>`) and from the host-qualified contribution ids the runtime
derives from it.
_Avoid_: using core's `com.openforge.*` namespace; conflating id with package name.

**OpenForge Checkout**:
The sibling clone of the OpenForge product repo (expected at `../openforge`) that
provides the **SDK** this repo builds against. A required local dependency, not a
runtime dependency of the shipped plugins.
_Avoid_: "the OpenForge install", "the app" — the running desktop app is a
different thing from the source checkout.

**SDK**:
`@openforge/plugin-sdk` and its subpaths (`/frontend`, `/backend`, `/testing`,
`/vite`). The only OpenForge code a plugin may import. Consumed here via a local
**SDK Link**, not a published package.
_Avoid_: OpenForge app internals, renderer stores, Electron/preload, Rust internals.

**SDK Link**:
The per-plugin `link:` dependency pointing at the SDK inside the **OpenForge
Checkout**. A live symlink: a rebuilt SDK is picked up without reinstalling.
_Avoid_: vendored SDK copy, npm/registry dependency (neither exists today —
see `docs/adr/0001`).

**Catalog**:
The pnpm catalog in `pnpm-workspace.yaml` that pins the shared build toolchain
(svelte, vite, vitest, typescript, …) so every plugin builds against one identical
toolchain. The **SDK** is deliberately excluded from it.
_Avoid_: per-plugin version drift; putting the SDK link in the catalog (pnpm
rejects `link:` there).

**Frontend Entry / Backend Entry**:
The two independent built artifacts a plugin may ship (`dist/frontend.js`,
`dist/backend.js`), each registered through `defineFrontendPlugin` /
`defineBackendPlugin`. A plugin may ship either or both.
_Avoid_: "the bundle" (there can be two); mixing renderer-only and backend-only
registries across the boundary.

**Local-Path Install**:
The way a built plugin from this repo is loaded into a running OpenForge app —
pointing the app's plugin manager at the plugin directory's absolute path. Install
is app-wide; enablement is per project.
_Avoid_: "publish", "deploy" — there is no registry or marketplace step.
