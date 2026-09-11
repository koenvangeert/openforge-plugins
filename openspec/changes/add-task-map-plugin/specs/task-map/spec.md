## Purpose

Shows a Project's active OpenForge Tasks as a spatial map, where Regions come
from Task Labels and arrows come from `dependsOn`, so the shape of the open work
is visible instead of being spread over a status board. Everything the map shows
is derived from Task data; the only thing it owns is where each card sits.

## ADDED Requirements

### Requirement: Map availability

The plugin SHALL contribute a Task Map View to the icon rail. The View SHALL
show the map of the active Project.

A View opened with no active Project SHALL say that no Project is selected and
SHALL draw no map. Switching the active Project SHALL replace the map with that
Project's own map, including its own curated Region order and its own card
positions.

#### Scenario: No Project is active

- **WHEN** a user opens the Task Map View with no active Project
- **THEN** the View says no Project is selected
- **AND** no cards, Regions, or arrows are drawn

#### Scenario: Project has no active Tasks

- **WHEN** a user opens the Task Map View for a Project whose every Task is
  Completed
- **THEN** the View says the Project has no active Tasks
- **AND** no cards are drawn

#### Scenario: Active Project changes

- **WHEN** the active Project changes while the Task Map View is open
- **THEN** the map is replaced by the new Project's cards, Regions, and stored
  positions

### Requirement: Card set

Every non-Completed Task of the active Project SHALL appear on the map exactly
once. A Completed Task SHALL NOT appear.

A card SHALL show its Task's title, and SHALL distinguish a Task in `backlog`
from a Task in `doing`.

A Task with an empty title SHALL still be identifiable on the map by its Task
id, because an untitled Task must not render as a blank card.

The map SHALL follow Task changes without user action: a created Task SHALL
appear, a Completed Task SHALL disappear, and a retitled or relabelled Task
SHALL update.

#### Scenario: One card per Task

- **WHEN** the active Project has twelve non-Completed Tasks
- **THEN** the map draws twelve cards

#### Scenario: Task is completed while the map is open

- **WHEN** a Task shown on the map becomes Completed
- **THEN** its card is removed from the map
- **AND** every arrow that pointed at that card is removed

#### Scenario: Task is created while the map is open

- **WHEN** a new Task is created in the active Project
- **THEN** a card for it appears on the map without the user reopening the View

#### Scenario: Task has no title

- **WHEN** a Task's title is empty
- **THEN** its card shows the Task id instead of empty text

### Requirement: Region vocabulary

The map SHALL be divided into Regions. The Region order SHALL be a curated list
of Task Label names, persisted per Project, and SHALL be editable by the user.

On the first open of a Project's map, the curated list SHALL be seeded with the
Task Label names the Project's active Tasks carry.

The labels offered for curation SHALL be those carried by the Project's active
Tasks. A Task Label that no active Task carries SHALL NOT be offered, because the
plugin SDK exposes no surface that lists a Project's Task Labels.

A curated label that no active Task currently carries SHALL remain in the
curated list and SHALL draw an empty Region, so a label whose Tasks are all
Completed is not silently dropped from the user's chosen order.

Reordering the curated list SHALL change which Region each Task falls into
wherever that changes its primary label.

#### Scenario: First open seeds the order

- **WHEN** a user opens the Task Map View for a Project that has no curated
  Region order yet
- **THEN** the curated order contains every Task Label carried by that Project's
  active Tasks

#### Scenario: Label offered for curation

- **WHEN** a user edits the Region order
- **THEN** the labels offered are those carried by the Project's active Tasks

#### Scenario: Curated label falls out of use

- **WHEN** every Task carrying a curated label becomes Completed
- **THEN** that label keeps its place in the curated order
- **AND** its Region is drawn empty

### Requirement: Primary Region assignment

A Task SHALL be placed in the first Region, in curated order, whose label the
Task carries. A Task carrying several curated labels SHALL be placed only in that
first Region and SHALL NOT be repeated in the others.

A Task carrying no curated label SHALL be placed in a trailing
`No label / Other` Region. That Region SHALL always be last, and SHALL NOT be
reorderable.

A change to a Task's labels, or to the curated order, that changes a Task's
primary Region SHALL move its card into the new Region.

#### Scenario: Task carries one curated label

- **WHEN** a Task carries the curated label `auth`
- **THEN** its card is drawn inside the `auth` Region

#### Scenario: Task carries several curated labels

- **GIVEN** the curated order is `auth`, then `api`
- **WHEN** a Task carries both `auth` and `api`
- **THEN** exactly one card is drawn for that Task, inside the `auth` Region
- **AND** no card for that Task is drawn inside the `api` Region

#### Scenario: Curated order is changed

- **GIVEN** a Task carries both `auth` and `api`, and the curated order is
  `auth`, then `api`
- **WHEN** the user reorders the curated list to `api`, then `auth`
- **THEN** that Task's card moves into the `api` Region

#### Scenario: Task carries no curated label

- **WHEN** a Task carries no label in the curated order
- **THEN** its card is drawn inside the `No label / Other` Region

### Requirement: Derived dependency arrows

The map SHALL draw an arrow for each `dependsOn` entry whose target is a card on
the map. An arrow SHALL be directional, so a viewer can tell which Task waits on
which: it SHALL leave the Task depended on and SHALL point at the Task that
waits.

A pair of Tasks SHALL carry one arrow per direction. A `dependsOn` list that
repeats the same target SHALL draw one arrow, and a Task listing itself SHALL
draw none, because neither can be told apart from the single arrow on screen.

An arrow SHALL stay visible where it passes a card, because an arrow hidden
under a card reads as two unconnected stubs.

An arrow SHALL be drawn whether its two cards sit in the same Region or in
different Regions.

A `dependsOn` entry whose target is not a card on the map SHALL NOT be drawn.
This covers a dependency on a Completed Task, which is a satisfied dependency,
and a dependency on a Task that no longer exists.

The map SHALL NOT offer any way to create, edit, or delete a relation, because
no supported interface writes `dependsOn` on a Task that already exists.

A cyclic `dependsOn` chain SHALL NOT prevent the map from drawing. Every card in
the cycle SHALL still be placed and every arrow within the cycle SHALL still be
drawn.

#### Scenario: Dependency between two active Tasks

- **WHEN** Task A lists Task B in `dependsOn` and both are active
- **THEN** an arrow is drawn between the two cards showing that A waits on B
- **AND** the arrow points at A

#### Scenario: Repeated or self dependency

- **WHEN** Task A lists Task B twice in `dependsOn`, and also lists itself
- **THEN** one arrow is drawn, from B to A

#### Scenario: Dependency crosses a Region

- **WHEN** Task A in the `auth` Region lists Task B in the `api` Region
- **THEN** the arrow is drawn between the two Regions

#### Scenario: Dependency on a Completed Task

- **WHEN** Task A lists a Completed Task in `dependsOn`
- **THEN** no arrow is drawn for that entry
- **AND** Task A's card is still drawn

#### Scenario: Cyclic dependency

- **WHEN** Task A lists Task B and Task B lists Task A
- **THEN** the map draws both cards and both arrows

#### Scenario: No relation editing

- **WHEN** a user interacts with a card or an arrow
- **THEN** no control to add, change, or remove a dependency is offered

### Requirement: Card position

A card without a stored position SHALL be placed by the map inside its own
Region, ordered by how deep it sits in the dependency chain, so a first open can
be read from its least dependent cards to its most dependent ones.

A user SHALL be able to drag a card. A stored position SHALL be persisted per
Task, per Project, and SHALL be restored when the View is reopened and when the
app restarts.

A stored position SHALL take priority over the map's own placement.

Concurrent position writes SHALL NOT lose each other. A user dragging several
cards in quick succession SHALL find every one of those positions restored on
reopen, because the underlying store offers no atomic update and a plain
read-modify-write would discard the earlier drag.

A stored position for a Task that is no longer on the map SHALL NOT affect any
other card.

#### Scenario: First open places cards automatically

- **WHEN** a user opens a Project's map for the first time
- **THEN** every card is placed inside its Region
- **AND** a Task appears after the Tasks it depends on

#### Scenario: Position survives a reopen

- **WHEN** a user drags a card, closes the View, and opens it again
- **THEN** the card is at the position the user left it

#### Scenario: Several drags in quick succession

- **WHEN** a user drags three cards one after another and reopens the View
- **THEN** all three cards are at their dragged positions

#### Scenario: Task leaves the map

- **WHEN** a Task with a stored position becomes Completed
- **THEN** its card is removed
- **AND** every remaining card keeps its own position

### Requirement: Drag is clamped to the Region

A drag SHALL be confined to the dragged card's own Region. A card SHALL NOT come
to rest outside the Region its primary label puts it in.

A drag that leaves the Region SHALL return the card inside that Region rather
than placing it under another Region's heading, because a plugin cannot write
Task Labels and so a cross-Region drop could never change the Task.

A card whose primary Region changes SHALL be re-placed by the map inside its new
Region, and its position in the Region it left SHALL NOT be reused.

#### Scenario: Drag stays inside the Region

- **WHEN** a user drags a card within its own Region
- **THEN** the card rests where it was dropped

#### Scenario: Drag leaves the Region

- **WHEN** a user drags a card past the boundary of its own Region and releases
- **THEN** the card comes to rest inside its own Region
- **AND** the Task's labels are unchanged

#### Scenario: Region changes after a drag

- **GIVEN** a user has dragged a card inside the `auth` Region
- **WHEN** that Task's labels change so its primary Region becomes `api`
- **THEN** the card is placed by the map inside the `api` Region
- **AND** its earlier `auth` position is not applied

### Requirement: Opening a Task from the map

Clicking a card SHALL open that Task on the host board. The map SHALL NOT
present its own Task detail panel.

#### Scenario: User clicks a card

- **WHEN** a user clicks a card on the map
- **THEN** the host board opens with that Task selected
