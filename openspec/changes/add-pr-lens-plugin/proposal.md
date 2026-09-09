## Why

An OpenForge Task hands back a diff and prose. Reconstructing what moved
structurally from a diff is slow, and the one tool that draws that picture,
PR Lens, only runs once a pull request exists and its GitHub App has commented.
The reviewer sitting in front of the Task in OpenForge, at the moment the agent
returns control, has no architecture view at all.

PR Lens is MIT-licensed and ships its renderer as a standalone npm package with
no network calls, so the drawing half is free to embed. The only paid step is
turning a diff into a graph document, and the Task's own Agent has just written
that diff. Asking the Agent for the document costs nothing beyond the run
already in progress and needs no API key.

## What Changes

- New Trusted Plugin `plugins/pr-lens` (`dev.kvg.pr-lens`), frontend and backend.
- A **PR Lens** Task tab renders the Task's stored diagram, light or dark to
  match the host appearance.
- A **Generate diagram** control in that tab sends a prompt into the Task's Agent
  Session through `tasks.sendFollowUp`, asking the Agent to describe its own diff
  as a PR Lens graph document.
- An agent-facing backend command receives the document, validates it against
  `@coldtea/pr-lens-schema`, and stores it in task-scoped plugin storage.
- The tab renders SVG from the stored document with `@coldtea/pr-lens-renderer`
  on every paint. The document is stored; the SVG never is.
- A Project-owned prompt template, editable in a plugin settings section,
  supplies the text sent to the Agent. Its default is self-contained, so nothing
  needs installing on the machine; a user who has the PR Lens agent skill
  installed can shorten theirs to invoke it instead.
- The tab is hidden entirely when the Task has no Agent Session, so the control
  is never present without a delivery path.
- Each stored document carries provenance: when it was generated, which Agent
  Session produced it, and the Agent-reported commit and dirty state. A diagram
  produced by an older session than the Task's current one is marked stale.

Out of scope for this change:

- **No LLM in the plugin.** No API key, no model settings, no provider fallback.
  The Agent is the only generator.
- **No GitHub dependency.** The plugin does not read PR comments, call the
  GitHub App, or write anything back to a pull request.
- **No review-row contribution.** The SDK's `reviewUI.registerRowAction` targets
  pull requests with no OpenForge Task behind them, which this generation path
  cannot serve.
- **No Task-information section.** The diagram is wide; the tab is its only home.
- **No automatic generation.** Every diagram is produced by an explicit user
  action.

## Capabilities

### New Capabilities

- `pr-lens-diagram`: requesting a PR Lens diagram for an OpenForge Task,
  receiving and validating the graph document the Agent produces, storing it with
  its provenance, and presenting it as a rendered diagram whose staleness is
  visible.

### Modified Capabilities

None. This change introduces the first specification in this repository and
alters no existing requirement.

## Impact

- **New package**: `plugins/pr-lens`, added to the pnpm workspace, built and
  tested like every other plugin in this repo.
- **New runtime dependencies**: `@coldtea/pr-lens-schema` and
  `@coldtea/pr-lens-renderer`, which together pull in only `zod`. Both are
  offline and deterministic. Neither goes in the catalog, which pins the shared
  build toolchain rather than plugin runtime dependencies.
- **SDK capabilities declared**: `backend`, `commands`, `context`, `events`,
  `settings`, `storage`, `taskPane`, `tasks`. No new host capability is needed.
- **Host coupling**: `tasks.sendFollowUp` and `tasks.getLatestSession` become
  load-bearing for this plugin. Both are documented SDK surface.
- **Documentation**: `CONTEXT.md` gains a PR Lens plugin glossary section, and
  the plugin-id table in `AGENTS.md` gains a row.
