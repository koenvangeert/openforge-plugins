## Context

See `proposal.md` for motivation. The constraints that shape the approach:

- `tasks.active(projectId)` returns every non-Completed `TaskDetail` with its
  `dependsOn` and `labels` in one unpaged call. That single read is the whole
  graph, so no fan-out or caching layer is needed.
- The SDK's write surface on an existing Task is `updateStatus`,
  `startImplementation`, `sendFollowUp`, and `configureStartPromptContribution`.
  There is no way to change `dependsOn` or `labels`. Every relation and every
  grouping the map shows is therefore read-only.
- The plugin SDK exposes no surface that lists a Project's Task Labels, so
  `TaskDetail.labels` is the only label source available here. The host does hold
  the full list, which the CLI's `project labels list` returns, so this is an SDK
  gap rather than missing data.
- `PluginStorageScope` is `get` / `set` / `delete` over a whole JSON value with
  no atomic update. `plugins/issues/src/backend/boardStore.ts` documents the
  resulting lost-update trap and its serialized-writer fix.
- A rail View component receives `api`, `context`, and `projectId` as props
  (see `plugins/issues/src/components/IssuesView.svelte`).

## Goals / Non-Goals

**Goals:**

- Assemble Regions, primary-label placement, layering, and arrow selection in
  pure functions, testable without a DOM, in the style of
  `plugins/issues/src/lib/board.ts`.
- Survive a relabelled, retitled, created, or Completed Task with no user action
  and no stale card.
- Never lose a dragged position, including drags in quick succession.
- Keep a stored position meaningful after Region heights change.

**Non-Goals:**

- No graph-layout library. Region-local layering is small enough to own.
- No optimistic mutation path. The map writes positions and nothing else, so
  there is no Task write to roll back.
- No virtualization. A Project's active Task count is bounded by what a person
  keeps open, not by repository size.

## Decisions

### One frontend bundle, no backend

`storage` is on `OpenForgeCommonAPI`, so the frontend both reads Tasks and
persists positions. A backend entry would add a second bundle, a second Vite
config, and a bridge hop for no capability the frontend lacks.

_Alternative:_ mirror `plugins/issues`, which puts its board store in the
backend. It has to, because its state is assembled from the GitHub REST API with
a token. This plugin calls no network.

This makes it the first frontend-only plugin in the repo. Every existing plugin
ships both bundles and so carries a `vite.backend.config.ts`. The scaffold drops
that file and the second `vite build`, which is a smaller `package.json` than
any plugin here has, not a new pattern the SDK has to support.

### Regions are horizontal bands, stacked vertically

Each Region is a full-width band whose height grows with its content. Bands
stack in curated order, with `No label / Other` last.

This makes clamping trivial (clamp `y` to the band, `x` to the canvas width),
makes a Region heading readable at any zoom, and gives dependency layering a
natural direction inside each band.

_Alternative:_ free-floating rectangles, Miro-style. Rejected: they can overlap,
which makes "which Region am I clamped to" a hit-test rather than a lookup, and
they need positions of their own that no Task field can derive.

### A stored position is relative to its Region, normalized

A position is stored as an offset from the Region's own origin, not as an
absolute canvas coordinate. A Region's origin moves whenever a band above it
grows or shrinks, which happens on any Task change. Absolute coordinates would
silently drift a card out of its own band.

Storage under `storage.project(projectId)`:

| Key | Value |
| --- | --- |
| `regionLabels` | `string[]`, the curated Region order |
| `cardPositions` | `Record<taskId, { x: number, y: number }>`, Region-relative |

Two keys rather than one document, so reordering Regions never rewrites every
position and a corrupt value in one does not lose the other.

### Position writes are debounced and serialized per Project

A drag emits continuously. Writes are debounced to the end of the gesture, and
every write for a Project goes through one promise chain, exactly as
`boardStore.ts:serializePerProject` does. Without the chain two overlapping
read-modify-write cycles read the same snapshot and the later `set` erases the
earlier card's position.

A failed write must not strand later writes, so the chain continues past a
rejection.

### Placement is Region-local longest-path layering

Inside a Region, a card's row is the length of the longest `dependsOn` chain
reaching it through cards in the same Region. Row 0 holds cards depending on
nothing local; each later row holds cards waiting on an earlier row. Within a
row, order is stable by Task id so a re-read does not reshuffle.

Cross-Region arrows are drawn but do not affect layering. Layering a Region
against another Region's rows would couple every band's height to every other
band, and a Region's own reading order is the useful one.

A cycle has no longest path. The layering walk tracks its visited set and treats
a card whose chain revisits itself as row 0, the same guard
`board.ts:parentChainCycles` uses for cyclic parent links.

_Alternative:_ `dagre` or `elkjs`. Both are heavier than the problem: bands are
narrow, edge routing is straight lines, and a pure local function stays testable
in Vitest with no DOM.

### A primary label, not a duplicated card

The first curated label a Task carries wins; the Task appears once.

This deliberately diverges from `plugins/issues`, whose `placeCards` repeats a
card in every column whose label it carries. Duplication works for columns, where
a card has no identity beyond its column. On a map a duplicate needs two stored
positions and doubles every arrow into it, so the same Task would appear to
depend on itself.

_Alternatives considered and rejected during exploration:_ hull outlines per
label, which allow overlap and need no primary rule, but produce unreadable
overlapping outlines over scattered cards.

### Clamped drag, with a re-place on Region change

A drag is clamped to its own band. A drop aimed at another Region cannot be
honoured, because honouring it would mean writing a Task Label.

When a Task's primary Region changes, its stored position is discarded rather
than carried over. A `y` offset valid in a tall band is meaningless in a short
one, and the map's own layering gives a correct placement for free.

### Clicking a card leaves the map

`navigation.navigate({ viewId: 'board', taskId })`, the same call
`plugins/issues` and `plugins/jira` use. Rebuilding a Task detail panel inside
the View is roughly the 420 lines `CardDrawer.svelte` plus
`useIssuesDrawer.svelte.ts` cost, for content the host already renders better.

### Reads are bounded and re-run on invalidation

`tasks.onDidChange(projectId, ...)` is an invalidation, not a snapshot, and the
host may coalesce a burst. The handler re-runs `tasks.active(projectId)` rather
than patching state from the event.

A project-activation counter guards against a stale read landing after a Project
switch, reusing the `isCurrentActivation` pattern from
`useIssuesBoard.svelte.ts`.

## Risks / Trade-offs

- **Lost position on concurrent writes** → debounce per gesture plus one
  serialized writer per Project; a test drags several cards in succession and
  asserts every position survives.
- **Card drifts out of its band when Regions resize** → positions are
  Region-relative, and a Region change discards the old position.
- **Arrow spaghetti at high Task counts** → Region-local layering keeps most
  arrows short; cross-Region arrows are the minority. If it still reads badly,
  de-emphasising arrows not touching the hovered card is a later, purely visual
  addition that changes no requirement.
- **Cyclic `dependsOn` hangs the layering walk** → visited-set guard, with a
  test for a two-Task and a three-Task cycle.
- **Label vocabulary is limited to labels in use** → a curated label whose Tasks
  are all Completed keeps its place and draws an empty band, so the user's chosen
  order is never silently rewritten by Task completion.
- **A Region reorder moves cards the user placed** → accepted. The curated order
  is the user's own act, and the new Region's layering places the card sensibly.
- **Positions accumulate for deleted Tasks** → harmless, since placement reads
  positions by the Task ids currently on the map. Pruning on read would rewrite
  storage on every open, so entries are left alone.

## Open Questions

- Arrow routing: straight lines or orthogonal elbows. Cosmetic, and changes no
  requirement, so it can be settled while building.
- Whether an empty Region collapses to its heading or keeps a minimum height.
