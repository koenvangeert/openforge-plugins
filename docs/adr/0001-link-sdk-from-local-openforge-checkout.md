# ADR 0001: Consume the plugin SDK via a local link to a sibling OpenForge checkout

Status: Accepted
Date: 2026-06-17
Task: KVG-1210

## Context

This monorepo builds OpenForge Trusted Plugins, which compile against
`@openforge/plugin-sdk`. At the time of writing:

- The SDK is version `0.1.0` and **not published to any registry** (public npm
  returns 404; no private registry is configured).
- Every existing OpenForge plugin lives *inside* the OpenForge pnpm workspace and
  references the SDK with `workspace:*`, building it with
  `pnpm --filter @openforge/plugin-sdk build`. None of that is available to a
  separate repo.
- OpenForge's own plugin runtime (ADR-0002) supports installing built plugins from
  `npm:`, `git:`, and local path sources — so a standalone plugins repo is a
  supported distribution model, but only the *consumer* side; it says nothing
  about how the *author* obtains the SDK.

A separate repo therefore has to decide how it gets the SDK before it can build
anything.

## Decision

Consume the SDK through a per-plugin pnpm `link:` dependency pointing at a sibling
OpenForge checkout:

```json
"@openforge/plugin-sdk": "link:../../../openforge/packages/plugin-sdk"
```

The expected layout is `workspace/tmp/{openforge, openforge-plugins}`. The SDK must
be built in that checkout (`pnpm run build:sdk`) because its `exports` resolve to
`dist/`. The link is a live symlink, so SDK rebuilds are picked up without
reinstalling.

The pnpm catalog pins the shared build toolchain (svelte, vite, vitest, typescript,
…) to the same versions OpenForge's plugins use, but the SDK is intentionally **not**
in the catalog.

## Alternatives considered

- **Publish the SDK to a private registry** (GitHub Packages / Artifactory) and
  depend on a version range. The clean long-term answer and what
  `publishConfig.access: public` hints at — but the SDK is owned by the OpenForge
  repo and has no release pipeline yet. Rejected as the day-one mechanism; it
  remains the intended migration target.
- **Vendor a built copy of the SDK** into this repo. Self-contained, but drifts
  from source and needs manual re-sync on every SDK change. Rejected.
- **Put the SDK link in the pnpm catalog** for a single source of truth. pnpm 11.5
  rejects the `link:` protocol inside a catalog
  (`ERR_PNPM_CATALOG_ENTRY_INVALID_SPEC`). Not currently possible.
- **Develop plugins inside the OpenForge monorepo** under its `plugins/`. Reuses
  everything the samples assume, but defeats the purpose of a separate repo and
  mixes these plugins with OpenForge core. Rejected.

## Consequences

Positive:

- Unblocks plugin development today with no publishing infrastructure.
- Tracks the SDK live; no version-bump dance during co-development.
- Toolchain stays aligned with OpenForge via the catalog.

Negative / costs:

- The repo is **not self-contained**: it requires a sibling OpenForge checkout at a
  known relative path, with the SDK built. CI or a fresh machine cannot build
  plugins without that checkout.
- The relative `link:` path encodes the sibling layout; moving either repo breaks
  every plugin's dependency.
- Migrating to a published SDK later means changing each plugin's dependency from
  `link:` to a version range (and adding registry config). Low effort, but a
  deliberate follow-up.

## Follow-up

- When the SDK is published to a registry, switch plugins from `link:` to a
  versioned dependency and revisit this ADR.
