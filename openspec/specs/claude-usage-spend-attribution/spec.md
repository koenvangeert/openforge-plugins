# claude-usage-spend-attribution Specification

## Purpose

Assigns each Billed Response recorded by Claude Code to the OpenForge Task that
caused it and to the Project it was recorded in, so a Task pane and the Spend
Dashboard agree on what a Task cost and no spend is quietly dropped.

## Requirements

### Requirement: Task attribution by Agent Session

Spend SHALL be attributed to a Task only through the Claude Code session
identity the host recorded for that Task's Agent Sessions. The working
directory recorded for a Billed Response SHALL NOT attribute it to a Task.

Tasks that run in their Project checkout share one directory, and share it with
the Project, so a directory can name a Project but never a Task. A session
identity names exactly one Task.

A Task SHALL total the spend of every Agent Session recorded against it.

An Agent Session the host recorded without a Claude Code session identity SHALL
contribute nothing, rather than falling back to its workspace directory.

#### Scenario: Task runs in its Project checkout

- **WHEN** a Task's Agent Session ran in the Project checkout directory
- **THEN** the Task reports the spend of that Agent Session
- **AND** no spend from another Task sharing that directory is included

#### Scenario: Task runs in a worktree

- **WHEN** a Task's Agent Session ran in its own worktree
- **THEN** the Task reports the spend of that Agent Session

#### Scenario: Task ran several times

- **WHEN** a Task has more than one recorded Agent Session
- **THEN** the Task reports the sum of their spend

#### Scenario: Agent Session has no recorded session identity

- **WHEN** a Task's only Agent Session has no Claude Code session identity
- **THEN** the Task reports no spend
- **AND** the spend still appears under the Task's Project

#### Scenario: Claude Code ran outside any Agent Session

- **WHEN** spend is recorded for a Claude Code session the host does not know
- **THEN** no Task reports it

### Requirement: Project attribution by directory

Spend SHALL be attributed to a Project when the working directory recorded for
it lies within that Project's checkout or within a Task workspace belonging to
that Project. Matching SHALL be by directory prefix, and the longest matching
directory SHALL win, so a Task worktree nested inside a Project checkout
resolves to its own Task's Project.

A Project's total SHALL cover every Billed Response recorded in its tree,
whether or not a Task claims it. Task attribution and Project attribution are
independent: one Billed Response may appear on both, on the Project alone, or
on neither.

Spend whose directory matches no Project checkout and no Task workspace SHALL
be reported as unattributed, and SHALL NOT be hidden or spread across Projects.

#### Scenario: Directory inside a Project checkout

- **WHEN** spend is recorded in a directory inside a Project checkout
- **THEN** that Project's total includes it

#### Scenario: Directory inside a Task worktree outside the checkout

- **WHEN** spend is recorded in a Task worktree that lies outside every Project
  checkout
- **THEN** the worktree's Task's Project includes it

#### Scenario: Project total covers work no Task claims

- **WHEN** spend is recorded in a Project checkout by a Claude Code session the
  host does not know
- **THEN** the Project's total includes it
- **AND** no Task reports it

#### Scenario: Directory outside every Project and Task workspace

- **WHEN** spend is recorded in a directory matching no Project checkout and no
  Task workspace
- **THEN** it is reported as unattributed

### Requirement: A Task with no attributed spend is distinguishable

A surface showing a Task's spend SHALL distinguish a Task with no attributable
Agent Session from a Task whose attributed spend priced to zero, because
rendering both as a zero amount claims the Task was free when the truth is that
nothing was recorded for it.

While the figure is still being resolved, the surface SHALL show neither, and
SHALL NOT show a zero amount that later changes.

#### Scenario: No Agent Session maps to the Task

- **WHEN** no recorded Claude Code session maps to the open Task
- **THEN** the Task pane shows that no spend is recorded, not an amount

#### Scenario: Attributed spend prices to zero

- **WHEN** spend maps to the Task and prices to zero
- **THEN** the Task pane shows a zero amount

#### Scenario: Figure is still loading

- **WHEN** the Task's spend has not resolved yet
- **THEN** the Task pane shows neither an amount nor a no-spend state

### Requirement: The Dashboard's Task axis matches the Task pane

The Spend Dashboard's Task axis SHALL use the same attribution rule as the Task
pane, so a Task's figure is the same wherever it is read.

The Dashboard's Project axis, its totals, its daily series, and its per-model
breakdown SHALL NOT change when Task attribution narrows, because they do not
depend on Task attribution.

#### Scenario: Same Task read on both surfaces

- **WHEN** a Task appears on the Spend Dashboard's Task axis
- **THEN** its figure equals the figure its Task pane shows

#### Scenario: Task attribution finds nothing

- **WHEN** no Task attribution can be resolved for any recorded spend
- **THEN** the Dashboard's totals, Project axis, daily series, and per-model
  breakdown are unchanged
