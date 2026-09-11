# @kvg/openforge-task-map

A Trusted Plugin (`dev.kvg.task-map`) that shows one Project's active OpenForge
**Tasks** as a field of cards on a pannable, zoomable canvas. Read-only: the map
derives everything it draws from Task reads and changes no Task.

## Surfaces

- **Rail view** (`views.register`) — the Task Map for the active Project.

## What it draws

- One card per non-Completed Task from `tasks.active(projectId)`. A Completed
  Task never appears.
- Card text from the Task title, falling back to the Task id so an untitled Task
  is never a blank card.
- A status chip separating `backlog` from `doing`.
- Cards laid out in a grid, `doing` first, then by Task id.
- One arrow per dependency between two cards on the map, pointing from the
  blocker to the Task that waits on it. A repeated `dependsOn` entry and a Task
  listing itself draw nothing extra. A dependency on a Completed Task or on a
  Task that no longer exists draws no arrow, and the waiting card still renders.
  A cyclic chain draws every card and every arrow.
- One band per Task Label, in a curated order seeded on first open from the
  labels the active Tasks carry, with a trailing `No label / Other` band. A Task
  sits in the first band whose label it carries, once.

The map follows Task changes on its own through `tasks.onDidChange`, so a
created, completed, retitled, or relabelled Task appears, disappears, or moves
band without the View being reopened.

## What the user owns

Where each card sits. A card can be dragged, and its position is kept per Task,
per Project, so it survives closing the View and restarting the app.

- A drag is confined to the card's own band. A card cannot come to rest above
  its own heading, nor left or right of the band's four card columns. Dragged
  downwards, the band grows under the pointer to hold it and the bands below
  move down.
- A position is stored as an offset from its band's own origin, so a band
  growing above it never drifts a card out of its band.
- A Task whose band changes is laid out again by the map, and the position it
  held in the band it left is forgotten rather than kept for a return trip. A
  position for a Task that leaves the map entirely is kept.
- A stored position wins over the map's own layering.

Two project-scoped storage keys, kept apart so reordering bands never rewrites
every position: `regionLabels` (the curated band order) and `cardPositions`
(`taskId` → `{ region, x, y }`). `PluginStorageScope` offers no atomic update,
so every write for a Project runs through one promise chain that continues past
a rejection, mirroring `plugins/issues/src/backend/boardStore.ts`. One drag
gesture writes once, at the drop. A stored value crosses a process boundary by
structured clone, so a position is copied out of reactive state before it is
written.

Clicking a card calls `navigation.navigate({ viewId: 'board', taskId })`, which
leaves the map and selects that Task on the host board. The map presents no Task
detail panel of its own.

## What it cannot change

Two things on the map are read-only because no supported plugin interface writes
them on a Task that already exists:

- **`dependsOn`** — the SDK's write surface on an existing Task is
  `updateStatus`, `startImplementation`, `sendFollowUp`, and
  `configureStartPromptContribution`. A dependency the user drew could never
  become true, so dependencies are derived only.
- **Task Labels** — same gap. Any grouping the map shows has to come from labels
  the user sets in the host, never from the canvas.

## Not built yet

Planned in `openspec/changes/add-task-map-plugin/`: an editor for the curated
band order. Until that lands, the order is the one seeded on first open.

## Build

```bash
npm test && npm run typecheck && npm run build
```

Frontend only. `storage` is on the common SDK surface, so there is no backend
bundle and no `vite.backend.config.ts`.
