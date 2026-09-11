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
- Every Task from `tasks.active(projectId)` becomes one card. Card text comes
  from `title`; card styling comes from `status`.
- The map is divided into **Regions**. Region order is a curated list of Task
  Label names in project-scoped plugin storage, seeded on first open from the
  labels the Project's active Tasks carry.
- A Task lands in the first Region whose label it carries. A trailing
  `No label / Other` Region holds every Task carrying no curated label.
- `dependsOn` is drawn as arrows between cards, including arrows that cross
  Regions.
- Cards can be dragged, and a drag is **clamped** to the card's own Region. A
  position is stored per Task id in project-scoped plugin storage, debounced
  while dragging and written through one serialized writer per Project.
- An unplaced Task is seeded by a layered layout inside its Region, ordered by
  dependency depth, so a first open reads top to bottom.
- Clicking a card calls `navigation.navigate({ viewId: 'board', taskId })`,
  which leaves the map and selects that Task on the host board.
- `tasks.onDidChange(projectId, ...)` triggers a re-read, so a created,
  completed, or relabelled Task appears, disappears, or moves Region on its own.

Out of scope for this change:

- **No drawn relations.** The SDK cannot write `dependsOn` on an existing Task,
  so an arrow the user draws could never become true. Arrows are derived only.
- **No user-made groups.** The SDK cannot write Task Labels either, so a Region
  the user invents on the canvas would belong to nobody. Regions are derived from
  Labels the user sets in the host.
- **No duplicated card.** A Task with several curated labels appears once, in its
  primary Region, not once per label. This deliberately differs from
  `plugins/issues`, whose columns repeat a card per matching label.
- **No side panel.** The SDK offers no way to mount the host's Task detail panel
  inside a plugin View, and this change does not rebuild one. A click leaves the
  map.
- **No Completed Tasks.** `tasks.active` excludes them, and this change does not
  page `tasks.completed` to add them back.
- **No Task editing.** The map neither changes status, starts an Implementation
  Run, nor sends a follow-up. It reads Tasks and stores positions.
- **No cross-Project map.** One Project, one map.

## Capabilities

### New Capabilities

- `task-map`: presenting a Project's active OpenForge Tasks as a spatial map
  whose Regions derive from Task Labels and whose arrows derive from
  `dependsOn`, with a Region-clamped card position the user owns and the plugin
  persists.

### Modified Capabilities

None. No existing requirement changes.

## Impact

- **New package**: `plugins/task-map`, a pnpm workspace member built and tested
  like every other plugin here.
- **No new runtime dependencies** beyond `@openforge-app/plugin-sdk` and
  `@lucide/svelte`. Layering, Region placement, and the primary-label rule are
  pure plugin functions in the style of `plugins/issues/src/lib/board.ts`. No
  graph-layout package is added.
- **No backend entry.** `storage` is on the common SDK surface, so the frontend
  reads Tasks and persists positions without a backend bundle.
- **SDK capabilities declared**: `views`, `tasks`, `storage`, `navigation`,
  `context`.
- **Host coupling**: `tasks.active`, `tasks.onDidChange`, and
  `navigation.navigate` become load-bearing. All three are documented SDK
  surface.
- **Known SDK gap**: no plugin SDK surface lists a Project's Task Labels, though
  the host holds them and the CLI's `project labels list` returns them. The Region
  vocabulary can therefore only be the labels the active Tasks carry, so a Label
  whose Tasks are all Completed cannot be offered as a new Region.
- **Storage hazard**: `PluginStorageScope` has no atomic update, the same trap
  `plugins/issues/src/backend/boardStore.ts` documents. Dragging writes often, so
  position writes need the debounce and the per-Project serialized writer named
  above.
- **Documentation**: `CONTEXT.md` gains a Task Map glossary section, and the
  plugin-id table in `AGENTS.md` gains a row.
