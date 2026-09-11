## Why

Spend Attribution reads only the working directory Claude Code recorded, and a
Task that runs in its Project checkout has the same directory as that Project.
The Project wins the match, so every in-place Task reports $0.00 on its Task
pane and never appears on the Spend Dashboard's Task axis. In-place Tasks are
not a corner case: 10 of the 16 Task workspaces created on 2026-09-10 were
`project_dir`, and several of them share one directory, so no directory rule
can tell them apart.

The host already records the Claude Code session id for each Agent Session, and
a transcript's filename is that same session id. That is an exact Task identity
where the directory is an ambiguous one.

## What Changes

- **BREAKING** Spend Attribution to a Task SHALL derive from the Agent Session's
  Claude Code session id, matched against the transcript a Spend Index row came
  from. The recorded working directory SHALL NOT attribute spend to a Task.
- Spend Attribution to a Project keeps its directory-prefix rule over Project
  checkouts and Task workspace paths, so worktree spend keeps rolling up to its
  Project.
- Task and Project become independent axes rather than one winner per Billed
  Response. A Project total covers every Billed Response recorded in its tree,
  Task-driven or not.
- The Spend Dashboard's Task axis uses the same session rule as the Task pane,
  so the two surfaces stop disagreeing.
- A Task with no Claude Code session that the Spend Index has seen renders an
  em dash, distinct from a Task that ran and cost nothing.
- The Spend Index gains the transcript's session identity on read. Rows are
  already grouped per transcript and the transcript filename carries the
  session id, so no re-scan and no stored-format change is needed.

### Accepted losses

- The host only began recording `claude_session_id` in August 2026: of the 117
  claude-code Agent Sessions created before then, none carry one. Those Tasks
  render an em dash and their spend shows under their Project only.
- Task-axis coverage drops from $4358 to $956 of $4782 recorded. The Task axis
  becomes correct rather than complete; the Project axis and every total stay
  unchanged.

## Capabilities

### New Capabilities

- `claude-usage-spend-attribution`: how a Billed Response is assigned to an
  OpenForge Task and to a Project, and what each surface shows when no
  assignment exists.

### Modified Capabilities

None. The plugin has no spec under `openspec/specs/` yet.

## Impact

- `plugins/claude-usage/src/attribution.ts`: session-id map replaces the Task
  half of the directory map.
- `plugins/claude-usage/src/spendIndex.ts`: row iteration exposes the transcript
  each row came from.
- `plugins/claude-usage/src/dashboard.ts`: `buildTaskSpend` and the Dashboard's
  Task axis switch to the session rule; Project and unattributed totals keep the
  directory rule.
- `plugins/claude-usage/src/spendService.ts`: reads Agent Sessions through
  `openforge.agentSessions.list`, already covered by the declared `tasks`
  capability, so the manifest is unchanged.
- `plugins/claude-usage/src/TaskSpendSection.svelte`: renders the no-session
  state.
- `CONTEXT.md`: the **Spend Attribution** entry describes the directory rule as
  the whole story and must be rewritten.
