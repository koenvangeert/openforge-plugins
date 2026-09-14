## Why

An OpenForge Task carries `dependsOn`, and the host board does not draw it. The
board's columns are `backlog`, `doing`, and `done`, so a Project with thirty
active Tasks shows thirty rows and no shape. Which Task blocks four others, and
which label area carries most of the open work, are questions the board cannot
answer.

The data is already one call away. `tasks.active(projectId)` returns every
non-Completed `TaskDetail` for the Project, each with its `dependsOn` edges and
its Task Labels, with no paging. Nothing in OpenForge draws that graph.

This change draws it. The map derives everything it shows from Task data the SDK
already exposes and owns only where each card sits.

## What Changes

- New Trusted Plugin `plugins/task-map` (`dev.kvg.task-map`), frontend only.
- A **Task Map** rail View shows one map for the active Project.
- Every Task from `tasks.active(projectId)` becomes a card. Card text comes from
  `title`; card styling comes from `status`.
- The map is divided into **Bands**. A Band is a free rectangle on the canvas,
  named after a Task Label. The curated set of Bands lives in project-scoped
  plugin storage, seeded on first open from the labels the Project's active Tasks
  carry. The set carries no order.
- A Task is drawn in every curated Band whose label it carries. A
  `No label / Other` Band holds every Task carrying no curated label.
- `dependsOn` is drawn as arrows between cards, including arrows that cross
  Bands. Where a Task is drawn in several Bands, its edges are drawn from each
  copy, so no copy is left looking unconnected.
- A Band can be dragged by its heading and resized by its corner. Its placement
  is stored per Project.
- A card can be dragged anywhere, and where it lands changes nothing about the
  Task. A position is stored per Task per Band as an offset inside its own Band,
  so dragging a Band carries its cards with it. A gesture writes once, at the
  drop, through one serialized writer per Project.
- An unplaced card is seeded by a layered layout inside its Band, ordered by
  dependency depth, so a first open reads top to bottom.
- Clicking a card calls `navigation.navigate({ viewId: 'board', taskId })`,
  which leaves the map and selects that Task on the host board.
- `tasks.onDidChange(projectId, ...)` triggers a re-read, so a created,
  completed, or relabelled Task appears, disappears, or changes Bands on its own.

Out of scope for this change:

- **No drawn relations.** The SDK cannot write `dependsOn` on an existing Task,
  so an arrow the user draws could never become true. Arrows are derived only.
- **No user-made groups.** The SDK cannot write Task Labels either, so a Band the
  user invents on the canvas would belong to nobody. Bands are named after Labels
  the user sets in the host, and a card dropped over a Band does not join it.
- **No side panel.** The SDK offers no way to mount the host's Task detail panel
  inside a plugin View, and this change does not rebuild one. A click leaves the
  map.
- **No Completed Tasks.** `tasks.active` excludes them, and this change does not
  page `tasks.completed` to add them back.
- **No Task editing.** The map neither changes status, starts an Implementation
  Run, nor sends a follow-up. It reads Tasks and stores placement.
- **No cross-Project map.** One Project, one map.

## Capabilities

### New Capabilities

- `task-map`: presenting a Project's active OpenForge Tasks as a spatial map
  whose Bands are named after Task Labels and whose arrows derive from
  `dependsOn`, with a Band placement and a card position the user owns and the
  plugin persists.

### Modified Capabilities

None. No existing requirement changes.

## Impact

- **New package**: `plugins/task-map`, a pnpm workspace member built and tested
  like every other plugin here.
- **No new runtime dependencies** beyond `@openforge-app/plugin-sdk` and
  `@lucide/svelte`. Layering, Band assembly, and the membership rule are pure
  plugin functions in the style of `plugins/issues/src/lib/board.ts`. No
  graph-layout package is added.
- **No backend entry.** `storage` is on the common SDK surface, so the frontend
  reads Tasks and persists placement without a backend bundle.
- **SDK capabilities declared**: `views`, `tasks`, `storage`, `navigation`,
  `context`.
- **Host coupling**: `tasks.active`, `tasks.onDidChange`, and
  `navigation.navigate` become load-bearing. All three are documented SDK
  surface.
- **Known SDK gap**: no plugin SDK surface lists a Project's Task Labels, though
  the host holds them and the CLI's `project labels list` returns them. The Band
  vocabulary can therefore only be the labels the active Tasks carry, so a Label
  whose Tasks are all Completed cannot be offered as a new Band.
- **Storage hazard**: `PluginStorageScope` has no atomic update, the same trap
  `plugins/issues/src/backend/boardStore.ts` documents. Dragging writes often, so
  placement writes need the write-once-at-the-drop rule and the per-Project
  serialized writer named above.
- **Documentation**: `CONTEXT.md` gains a Task Map glossary section, and the
  plugin-id table in `AGENTS.md` gains a row.
