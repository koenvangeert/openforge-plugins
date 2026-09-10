## Purpose

Gives an OpenForge Task an architecture diagram of the change its Agent made,
drawn from a graph document the Agent itself produces, so a reviewer can see
what moved before reading the diff. The diagram is generated on request, stored
with the Task, and shows when it no longer describes the Task's current state.

## ADDED Requirements

### Requirement: Diagram tab availability

The plugin SHALL contribute a PR Lens tab to every Task of a Project it is
enabled for. Tab registration SHALL NOT depend on the open Task's Agent Session
state, because the host publishes no Task-selection change to a plugin, so a
plugin that registers and unregisters its tab per Task settles on whichever
Task it last saw and hides the tab from Tasks that should show it.

The diagram request control SHALL instead be gated inside the tab: a Task with
no recorded Agent Session SHALL offer no request control, and SHALL say that the
Task has no Agent Session to ask for one.

The tab SHALL remain available when the Task's workspace cannot be resolved,
because a stored diagram is readable without a workspace.

#### Scenario: Task has never run

- **WHEN** a user opens a Task that has no Agent Session
- **THEN** the PR Lens tab appears with no request control
- **AND** the tab says the Task has no Agent Session to ask for a diagram

#### Scenario: Task has an Agent Session

- **WHEN** a user opens a Task that has at least one Agent Session
- **THEN** the PR Lens tab offers the request control

#### Scenario: Diagram outlives the Session that made it

- **WHEN** a Task's stored diagram remains after its Agent Sessions are gone
- **THEN** the tab still draws the stored diagram

#### Scenario: Workspace cannot be resolved

- **WHEN** a Task has an Agent Session but its workspace cannot be resolved
- **THEN** the PR Lens tab remains available and renders any stored diagram

### Requirement: Requesting a diagram

The PR Lens tab SHALL offer a control that requests a diagram for the Task by
submitting the Project's configured prompt to that Task's Agent Session.

The plugin SHALL report the outcome of the request. A request accepted by an
idle Agent and a request accepted while the Agent is working SHALL be
distinguishable to the user, because the second will not be acted on until the
Agent finishes its current work.

A request that cannot be delivered SHALL be reported as a failure naming the
reason, and SHALL leave any previously stored diagram unchanged.

#### Scenario: Agent is idle

- **WHEN** the user requests a diagram and the Task's Agent Session is idle
- **THEN** the prompt is submitted to that Agent Session
- **AND** the tab reports the request as delivered

#### Scenario: Agent is working

- **WHEN** the user requests a diagram while the Task's Agent Session is running or paused
- **THEN** the prompt is submitted to that Agent Session
- **AND** the tab reports the request as queued behind the Agent's current work

#### Scenario: Delivery fails

- **WHEN** the user requests a diagram and the Task's Agent Session cannot accept it
- **THEN** the tab reports the failure and its reason
- **AND** any previously stored diagram for that Task is still shown unchanged

### Requirement: Project-owned prompt template

Each Project SHALL own the prompt text sent to the Agent, editable by the user
in a plugin settings section, so a user can adapt it to their Agent's
conventions or point it at a locally installed PR Lens agent skill.

The plugin SHALL ship a default prompt that is self-contained, requiring nothing
to be installed on the machine beyond OpenForge and the plugin itself.

Saving a blank template SHALL restore the default rather than sending an empty
prompt. A Project that has never edited its template SHALL use the default.

Editing one Project's template SHALL NOT change any other Project's template.

#### Scenario: Project has never configured a template

- **WHEN** a user requests a diagram in a Project whose template was never edited
- **THEN** the default prompt is submitted to the Agent

#### Scenario: Project has an edited template

- **WHEN** a user has saved a custom template for a Project and requests a diagram
- **THEN** that Project's saved template is submitted to the Agent

#### Scenario: Template is cleared

- **WHEN** a user saves an empty template for a Project
- **THEN** the Project's template returns to the default
- **AND** the settings section shows the default text

#### Scenario: Templates do not leak across Projects

- **WHEN** a user saves a custom template for one Project
- **THEN** every other Project continues to use its own template

### Requirement: Accepting a graph document from the Agent

The plugin SHALL expose an Agent-invocable command that accepts a PR Lens graph
document for the current Task, so the Agent can return its result without the
user relaying it.

An accepted document SHALL be validated against the published PR Lens document
schema before it is stored. A document that fails validation SHALL be rejected
with the validation failures reported back to the caller, so the Agent can
correct and retry without user involvement, and the Task's previously stored
document SHALL be retained.

A command invocation without OpenForge Task context SHALL be rejected.

#### Scenario: Agent returns a valid document

- **WHEN** the Agent invokes the command with a document that satisfies the PR Lens schema
- **THEN** the document is stored for the invoking Task
- **AND** the command reports success

#### Scenario: Agent returns an invalid document

- **WHEN** the Agent invokes the command with a document that violates the PR Lens schema
- **THEN** the command fails and reports the specific validation failures
- **AND** the Task's previously stored document is unchanged

#### Scenario: Agent retries after a rejection

- **WHEN** the Agent corrects a rejected document and invokes the command again with a valid document
- **THEN** the corrected document is stored and the command reports success

#### Scenario: Invocation without Task context

- **WHEN** the command is invoked with no OpenForge Task in context
- **THEN** the command fails and reports that Task context is required

### Requirement: Diagram presentation

The PR Lens tab SHALL present the Task's stored graph document as a rendered
diagram. The stored artifact is the graph document; the rendered diagram SHALL
be produced from it on each render, so an improved renderer redraws every
previously stored document without regenerating any of them.

Rendering SHALL happen without network access, so a diagram remains viewable
offline and no Task content leaves the machine to be drawn.

The rendered diagram SHALL follow the host's configured light or dark
appearance.

A Task with no stored document SHALL show an empty state offering the request
control rather than a blank tab. A stored document that cannot be rendered
SHALL show an error naming the failure rather than a blank tab.

An open tab SHALL repaint when the Agent stores a new document for that Task,
without the user reopening or refreshing the tab.

#### Scenario: Task has a stored document

- **WHEN** a user opens the PR Lens tab of a Task with a stored graph document
- **THEN** the diagram rendered from that document is shown

#### Scenario: Task has no stored document

- **WHEN** a user opens the PR Lens tab of a Task with no stored graph document
- **THEN** an empty state is shown offering to request a diagram

#### Scenario: Host appearance changes

- **WHEN** the host switches between light and dark appearance while the tab is open
- **THEN** the diagram is shown in the matching appearance

#### Scenario: Agent stores a document while the tab is open

- **WHEN** the Agent stores a new document for a Task whose PR Lens tab is open
- **THEN** the tab repaints with the new diagram without user action

#### Scenario: Stored document cannot be rendered

- **WHEN** rendering a stored document fails
- **THEN** the tab shows an error describing the failure
- **AND** the stored document is retained

### Requirement: Diagram provenance and staleness

Each stored diagram SHALL carry provenance the reader can see: the repository
and head commit the graph document itself declares, the time the plugin stored
it, the Agent Session that produced it, and whether the Agent reported
uncommitted changes at generation time.

The graph document format already requires the repository and head commit, so a
document omitting them is rejected by validation rather than stored without
provenance. Working-tree cleanliness is not part of that format and SHALL be
recorded alongside the document as the Agent reported it. Cleanliness that the
Agent did not report SHALL be shown as unknown and SHALL NOT be presented as
clean.

A diagram SHALL be marked stale when the Task's current Agent Session is not the
one that produced it, because work has happened since. A diagram whose Agent
reported uncommitted changes SHALL be marked as describing work that was not
committed, because no later comparison can establish whether that work still
matches.

Marking a diagram stale SHALL NOT delete or hide it. A stale diagram remains
readable and remains available to regenerate.

#### Scenario: Diagram from the current session

- **WHEN** a user views a diagram produced by the Task's current Agent Session from a tree the Agent reported clean
- **THEN** the diagram is shown with its head commit and the time it was stored
- **AND** the diagram is not marked stale

#### Scenario: A newer session has run

- **WHEN** a user views a diagram produced by an Agent Session that is no longer the Task's current one
- **THEN** the diagram is shown and marked stale
- **AND** the request control remains available to regenerate it

#### Scenario: Diagram covered uncommitted work

- **WHEN** the Agent reported uncommitted changes when it generated the diagram
- **THEN** the diagram is marked as describing work that was not committed

#### Scenario: Agent does not report cleanliness

- **WHEN** the Agent stores a valid document without saying whether the tree was clean
- **THEN** the document is stored and rendered
- **AND** the tab shows the cleanliness as unknown rather than as clean

### Requirement: Diagram storage scope

Each Task SHALL hold at most one stored graph document. Storing a new document
for a Task SHALL replace that Task's previous document; there is no history.

A document stored for one Task SHALL NOT be shown for any other Task, including
Tasks in the same Project and Tasks linked to the same pull request.

#### Scenario: Regenerating replaces the previous diagram

- **WHEN** the Agent stores a second document for a Task that already has one
- **THEN** the Task shows the new diagram
- **AND** the previous document is no longer retrievable

#### Scenario: Documents are per Task

- **WHEN** one Task in a Project has a stored diagram and another has none
- **THEN** the second Task shows its empty state rather than the first Task's diagram
