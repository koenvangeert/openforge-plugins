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
- Cards laid out in rows by dependency depth, `doing` first, then by Task id.
- One arrow per dependency between two cards on the map, pointing from the
  blocker to the Task that waits on it. A repeated `dependsOn` entry and a Task
  listing itself draw nothing extra. A dependency on a Completed Task or on a
  Task that no longer exists draws no arrow, and the waiting card still renders.
  A cyclic chain draws every card and every arrow.
- One band per curated Task Label, plus a `No label / Other` band that is always
  present. A Task is drawn once in every band whose label it carries, and only
  in `No label / Other` when it carries none. A Task carrying two curated labels
  is drawn twice, once per band, and an arrow reaches every copy.

The map follows Task changes on its own through `tasks.onDidChange`, so a
created, completed, retitled, or relabelled Task appears, disappears, or moves
band without the View being reopened.

## What the user owns

**Where each band sits.** A band is a free rectangle, dragged by its heading and
resized by its corner handle. Bands carry no order and may overlap. The first
open seeds one band per label the active Tasks carry, stacked top to bottom;
after that the map never places a band for the user. A band's width sets how
many cards fit in a row, so narrowing it reflows the rows.

**Which bands are on the map.** The `Edit bands` button opens an in-view editor
offering the label names the active Tasks carry. Removing a band moves the Tasks
that carried only that label into `No label / Other`. A saved set is stored
before the map shows it, and a refused write leaves the editor open with the
reason. A curated label no active
Task carries keeps its band and renders it empty. `No label / Other` offers no
remove control.

**Where each card sits.** A card can be dragged, and its position is kept per
Task, per band, per Project, so it survives closing the View and restarting the
app.

- A drag is not clamped to the band outline. A card rests where it is dropped,
  and it still belongs to the band its Task's labels put it in. Only the canvas
  edge holds it: no card is ever drawn off the top or the left of the map.
- A position is stored as an offset inside its own band, so moving a band
  carries its cards.
- Dragging one copy of a Task drawn in two bands moves that copy alone.
- A position outlives a label the Task no longer carries: it applies again if
  the label returns.
- A stored position wins over the map's own layering.

Two project-scoped storage keys, kept apart so moving a band never rewrites
every position: `bands` (`{ label, x, y, width, height }[]`) and `cardPositions`
(`{ band, taskId, x, y }[]`, band-relative). `PluginStorageScope` offers no
atomic update, so every write for a Project runs through one promise chain that
continues past a rejection, mirroring
`plugins/issues/src/backend/boardStore.ts`. One drag gesture writes once, at the
drop. A stored value crosses a process boundary by structured clone, so a
position is copied out of reactive state before it is written.

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
- **Task Labels** — same gap. Band membership comes from labels the user sets in
  the host, never from where a card is dropped.

The band editor offers only the labels the active Tasks carry: no SDK surface
lists a Project's full Task Label vocabulary, and `TaskDetail.labels` is all the
plugin can see. The host does hold the full list (the CLI's
`project labels list` returns it), so this is an SDK gap rather than missing
data.

## Build

```bash
npm test && npm run typecheck && npm run build
```

Frontend only. `storage` is on the common SDK surface, so there is no backend
bundle and no `vite.backend.config.ts`.
