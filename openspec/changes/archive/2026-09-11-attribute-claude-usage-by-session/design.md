## Context

See proposal.md - Why.

What the current code does:

```
buildAttributionMap  ->  one list of { path, attribution }
                         Project checkouts and Task workspaces together,
                         sorted by path length descending
attribute(cwd)       ->  first prefix match wins, one winner per row
```

Equal-length paths tie. `Array.prototype.sort` is stable and Projects are
pushed first, so the Project wins every tie and the in-place Task gets nothing.

Three facts the design leans on, each verified against the live install:

- A transcript's filename is the Claude Code session id. Every record inside
  carries the same value in `sessionId`.
- `agent_sessions.claude_session_id` holds that id, and it is unique: 36 rows,
  36 distinct ids, none shared between Tasks.
- 91% of recorded spend sits in `~/.openforge/worktrees/...`, outside every
  Project checkout path. Project attribution therefore cannot drop the Task
  workspace paths from its directory map.

## Goals / Non-Goals

**Goals:**

- One attribution rule behind both the Task pane and the Dashboard's Task axis.
- No Spend Index format change and no re-scan of transcripts.
- No manifest change: stay inside the already-declared `tasks` capability.

**Non-Goals:**

- Recovering Task attribution for Agent Sessions the host recorded without a
  `claude_session_id`.
- Attributing the `claude -p` sessions OpenForge runs in temp directories.
- Reworking how often the attribution map is rebuilt (see Risks).

## Decisions

### Session identity comes from the transcript filename, not the records

The Spend Index already groups rows per transcript and keys them by the
transcript's path, whose basename is the session id. Reading identity from the
path costs one string operation on read.

_Alternative: capture `sessionId` from each record during the scan._ It would
put the id in the row key, which means an index format change and a full
re-scan of every transcript still on disk. Pruned periods cannot be re-scanned
at all, so those rows would never gain an id. Rejected: more work, and it
loses history the filename route keeps.

### The session-to-Task map comes from `agentSessions.list`

```ts
const endExclusive = Math.floor(now / 1000)
const startInclusive = earliestIndexedSecond   // computed once per rebuild
let cursor: string | undefined
do {
  const page = await openforge.agentSessions.list({
    provider: 'claude-code',
    overlaps: { startInclusive, endExclusive },
    pageSize: 250,
    cursor,
  })
  // page.items[].providerSessionId -> page.items[].task.id
  cursor = page.nextCursor ?? undefined
} while (cursor)
```

The interval is computed once and held for the whole pagination run, because
the host invalidates a cursor when any bound changes.

_Alternative: `tasks.listSessions({ taskId })` per Task._ Exact, but 1134 host
calls against the current install versus two pages. Rejected on cost.

`providerSessionId` is null for older Agent Sessions. Those are skipped, which
is what produces the accepted history loss.

### Task and Project become independent axes

```
row ---> session id ---> Task            (Task axis)
    \
     -> cwd prefix ----> Project         (Project axis, unchanged rule)
                         no match -> unattributed
```

A Billed Response can land on both axes, on the Project axis alone, or on
neither. A Project total is every Billed Response recorded in its tree, which
is what makes the Project figure stable while the Task axis narrows.

_Alternative: keep one winner and let the Task shadow its Project._ It is the
current design, and it is why a Project's own figure changes meaning whenever
Task attribution changes. Rejected.

### The Project axis keeps the Task workspace paths in its directory map

A worktree lives outside the Project checkout, so a directory map built from
Project paths alone strands 91% of spend as unattributed. The map keeps both
kinds of entry; only the resolved value changes, from "this Task" to "this
Task's Project".

### An unmatched Task renders an em dash

`TaskSpendData.found` already distinguishes "nothing matched" from "matched and
priced at zero"; only the Task pane's rendering collapses them. The pane renders
`—` when `found` is false, the amount otherwise, and `…` while loading.

## Risks / Trade-offs

- **80% of Task-axis history disappears** → Accepted and stated in proposal.md.
  The Project axis, every total, and the daily series are untouched, so no
  headline figure moves.
- **A Task whose spend the user can see on the Project row now shows an em dash**
  → The em dash reads as "not recorded", which is true, where `$0.00` read as
  "free", which was false.
- **The attribution map rebuilds every 30s and already costs 1134 `getWorkspace`
  calls; this adds two paginated reads** → Out of scope here. `agentSessions.list`
  returns `task` and `workspace.rootPath` in one paginated call, so a later
  change can retire the per-Task `getWorkspace` fan-out entirely and come out
  cheaper than today.
- **A session id present in the index but unknown to the host** (a `claude -p`
  run, or a transcript from before the Task existed) → No Task match, and the
  Project axis still catches it when it sits inside a checkout.
- **The host could one day reuse a session id across Tasks** → Verified unique
  today. A duplicate would double-count; the map is built last-write-wins, so
  the behaviour is at least deterministic.

## Migration Plan

No stored data changes, so there is nothing to migrate and no rollback step
beyond reverting the code. The Spend Index on disk is read by both the old and
the new attribution unchanged.
