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

Planned in `openspec/changes/add-task-map-plugin/`: label Regions, dragged card
positions in project-scoped plugin storage, and live refresh from
`tasks.onDidChange`. Until that lands, a Task created or completed while the
View is open appears after the Project is reselected.

## Build

```bash
npm test && npm run typecheck && npm run build
```

Frontend only. `storage` is on the common SDK surface, so there is no backend
bundle and no `vite.backend.config.ts`.
