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

- Assemble Bands, membership, layering, and arrow selection in pure functions,
  testable without a DOM, in the style of `plugins/issues/src/lib/board.ts`.
- Survive a relabelled, retitled, created, or Completed Task with no user action
  and no stale card.
- Never lose a dragged card or a moved Band, including drags in quick succession.
- Keep a stored card position meaningful after its Band moves or resizes.

**Non-Goals:**

- No graph-layout library. Band-local layering is small enough to own.
- No optimistic mutation path. The map writes placement and nothing else, so
  there is no Task write to roll back.
- No virtualization. A Project's active Task count is bounded by what a person
  keeps open, not by repository size.

## Decisions

### One frontend bundle, no backend

`storage` is on `OpenForgeCommonAPI`, so the frontend both reads Tasks and
persists placement. A backend entry would add a second bundle, a second Vite
config, and a bridge hop for no capability the frontend lacks.

_Alternative:_ mirror `plugins/issues`, which puts its board store in the
backend. It has to, because its state is assembled from the GitHub REST API with
a token. This plugin calls no network.

This makes it the first frontend-only plugin in the repo. Every existing plugin
ships both bundles and so carries a `vite.backend.config.ts`. The scaffold drops
that file and the second `vite build`, which is a smaller `package.json` than
any plugin here has, not a new pattern the SDK has to support.

### Bands are free rectangles the user places

A Band is a rectangle with its own `x`, `y`, `width`, and `height` on one shared
canvas. The user drags it by its heading and resizes it by its corner. Bands may
overlap, and no Band is first or last.

The curated set carries no order at all, which removes the whole question a
curated order raises: which Band wins for a Task carrying two labels. Nothing
about a Task's placement depends on which label the user curated first.

_Alternative:_ full-width horizontal bands stacked in a curated order, with a
card clamped to its own band. Rejected: the order is a second thing the user has
to maintain to say something the labels already say, and a stack cannot put two
related Bands side by side.

Because Bands can be dragged apart and overlapped, a Band is drawn as an outline
with a heading rather than a filled row, so an overlap reads as two regions
crossing rather than one hiding the other.

### A card per Band the Task's labels match

A Task is drawn once in every curated Band whose label it carries, the same
grouping rule `plugins/issues`'s `placeCards` uses for its columns.

With no curated order there is no first label to pick, and picking one by name
would hide a Task from a Band it genuinely belongs to. Duplication says the true
thing: this Task is part of both areas of work.

The cost is paid in arrows. An edge to a Task drawn in two Bands is drawn twice,
once per copy, so no copy is left looking unconnected. No arrow joins two copies
of the same Task: on screen it would be indistinguishable from a Task depending
on itself.

_Alternative:_ one card in one Band, chosen by a curated order or alphabetically.
Rejected with the order itself.

### A stored card position is an offset inside its own Band

A position is stored as an offset from its Band's own corner, not as an absolute
canvas coordinate. This is what makes dragging a Band carry its cards: the Band
moves, every offset inside it resolves against the new corner, and no card
position is rewritten.

Because a Task can be drawn in several Bands, a position is keyed by the pair
of Task and Band, not by Task alone. Dragging one copy moves only that copy.

Storage under `storage.project(projectId)`:

| Key             | Value                                                       |
| --------------- | ----------------------------------------------------------- |
| `bands`         | `{ label: string \| null, x, y, width, height }[]`           |
| `cardPositions` | `{ band: string \| null, taskId, x, y }[]`, Band-relative    |

Two keys rather than one document, so moving a Band never rewrites every card
position and a corrupt value in one does not lose the other. Both are arrays
carrying their own identity rather than records under an encoded key, so no
separator has to be assumed safe inside a Task Label name.

The curated set is the labels the `bands` entries carry. A Band's existence and
its placement are the same fact, so they are one key, not two.

### The drag is not clamped, and the Band still owns the card

A card may be dragged anywhere, including outside its own Band's rectangle. A
clamp would be a rule the map enforces for its own convenience, and the thing it
would protect against, a card changing Band by being dropped somewhere, cannot
happen anyway: membership is read from the Task's labels on every assembly.

A Band is therefore an outline that says which cards belong to it, not a
container that traps them.

### A Band fits the cards the map places in it

A Band's stored `width` sets how many cards fit per row, so making a Band
narrower reflows its rows. Its drawn height is the larger of its stored height
and the height its rows need, so a Band never clips a card the map itself placed,
while the user can still make it taller than its contents.

A card the user dragged out of the Band does not grow it. Growing to chase a
dragged card would make the outline meaningless.

### Placement is Band-local longest-path layering

Inside a Band, a card's row is the length of the longest `dependsOn` chain
reaching it through cards in the same Band. Row 0 holds cards depending on
nothing local; each later row holds cards waiting on an earlier row. Within a
row, `doing` comes before `backlog` and ties break on Task id, so a re-read does
not reshuffle.

Cross-Band arrows are drawn but do not affect layering. Layering a Band against
another Band's rows would couple every Band's size to every other Band, and a
Band's own reading order is the useful one.

A cycle has no longest path. Before the walk, every edge whose blocker is itself
reachable from its waiter is dropped, so the graph the walk reads is acyclic by
construction and the walk terminates. Reachability is a depth-first probe with a
visited set, in the spirit of `board.ts:parentChainCycles`. It costs a probe per
edge, which a Band-local edge set can afford.

_Alternative:_ `dagre` or `elkjs`. Both are heavier than the problem: Bands are
small, edge routing is straight lines, and a pure local function stays testable
in Vitest with no DOM.

### Placement is written once at the drop, through one writer per Project

A drag emits continuously, and nothing is written until the pointer is released.
Every write for a Project goes through one promise chain, exactly as
`boardStore.ts:serializePerProject` does. Without the chain two overlapping
read-modify-write cycles read the same snapshot and the later `set` erases the
earlier card's position.

A failed write must not strand later writes, so the chain continues past a
rejection.

### Clicking a card leaves the map

`navigation.navigate({ viewId: 'board', taskId })`, the same call
`plugins/issues` and `plugins/jira` use. Rebuilding a Task detail panel inside
the View is roughly the 420 lines `CardDrawer.svelte` plus
`useIssuesDrawer.svelte.ts` cost, for content the host already renders better.

Every copy of a Task navigates to that one Task, so a duplicated card costs the
reader nothing on click.

### Reads are bounded and re-run on invalidation

`tasks.onDidChange(projectId, ...)` is an invalidation, not a snapshot, and the
host may coalesce a burst. The handler re-runs `tasks.active(projectId)` rather
than patching state from the event.

A project-activation counter guards against a stale read landing after a Project
switch, reusing the `isCurrentActivation` pattern from
`useIssuesBoard.svelte.ts`.

### Arrows are orthogonal elbows in the gap between card rows

An arrow leaves the card edge facing its waiter, turns in the gap next to that
edge, and ends on the waiting card's edge. Two cards sharing a row are joined
under the row rather than straight across it, so an arrow between distant cards
does not run over the cards between them.

The arrow layer also paints above the cards. Cards are opaque, so an arrow
underneath them survives only in the gaps, which reads as unconnected stubs
rather than one arrow.

_Alternative:_ straight card-centre to card-centre lines. Rejected: on a row of
four cards, three arrows out of one card lie on the same line, so no viewer can
tell which card any line reaches.

## Risks / Trade-offs

- **Lost placement on concurrent writes** → one write per gesture plus one
  serialized writer per Project; a test drags several cards in succession and
  asserts every position survives.
- **A duplicated card reads as two Tasks** → accepted, and the reason the map
  never joins two copies with an arrow. Both copies carry the same title and open
  the same Task.
- **Duplication multiplies arrows** → a Task in two Bands doubles every edge
  touching it. Accepted: the alternative leaves one copy drawn with no arrows at
  all, which reads as an unblocked Task that is in fact blocked.
- **Overlapping Bands hide each other** → Bands are drawn as outlines, and the
  user placed them, so an overlap is a choice rather than something the map did.
- **Arrow spaghetti at high Task counts** → Band-local layering keeps most
  arrows short. If it still reads badly, de-emphasising arrows not touching the
  hovered card is a later, purely visual addition that changes no requirement.
- **Cyclic `dependsOn` hangs the layering walk** → back edges are dropped before
  the walk, with a test for a two-Task and a three-Task cycle.
- **Label vocabulary is limited to labels in use** → a curated label whose Tasks
  are all Completed keeps its Band and draws it empty, so the user's chosen set
  is never silently rewritten by Task completion.
- **Placement accumulates for deleted Tasks** → harmless, since assembly reads
  positions by the cards currently on the map. Pruning on read would rewrite
  storage on every open, so entries are left alone.
