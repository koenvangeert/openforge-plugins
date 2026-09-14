## Purpose

Shows a Project's active OpenForge Tasks as a spatial map, where Bands come from
Task Labels and arrows come from `dependsOn`, so the shape of the open work is
visible instead of being spread over a status board. Everything the map shows is
derived from Task data; the only things it owns are where each Band sits and
where each card sits inside it.

## ADDED Requirements

### Requirement: Map availability

The plugin SHALL contribute a Task Map View to the icon rail. The View SHALL
show the map of the active Project.

A View opened with no active Project SHALL say that no Project is selected and
SHALL draw no map. Switching the active Project SHALL replace the map with that
Project's own map, including its own curated Bands, their own placement, and its
own card positions.

#### Scenario: No Project is active

- **WHEN** a user opens the Task Map View with no active Project
- **THEN** the View says no Project is selected
- **AND** no cards, Bands, or arrows are drawn

#### Scenario: Project has no active Tasks

- **WHEN** a user opens the Task Map View for a Project whose every Task is
  Completed
- **THEN** the View says the Project has no active Tasks
- **AND** no cards are drawn

#### Scenario: Active Project changes

- **WHEN** the active Project changes while the Task Map View is open
- **THEN** the map is replaced by the new Project's cards, Bands, and stored
  placement

### Requirement: Card set

Every non-Completed Task of the active Project SHALL appear on the map at least
once. A Completed Task SHALL NOT appear.

A card SHALL show its Task's title, and SHALL distinguish a Task in `backlog`
from a Task in `doing`.

A Task with an empty title SHALL still be identifiable on the map by its Task
id, because an untitled Task must not render as a blank card.

The map SHALL follow Task changes without user action: a created Task SHALL
appear, a Completed Task SHALL disappear, and a retitled or relabelled Task
SHALL update.

#### Scenario: One card per Task in one Band

- **WHEN** the active Project has twelve non-Completed Tasks, each carrying at
  most one curated label
- **THEN** the map draws twelve cards

#### Scenario: Task is completed while the map is open

- **WHEN** a Task shown on the map becomes Completed
- **THEN** every card for it is removed from the map
- **AND** every arrow that pointed at those cards is removed

#### Scenario: Task is created while the map is open

- **WHEN** a new Task is created in the active Project
- **THEN** a card for it appears on the map without the user reopening the View

#### Scenario: Task has no title

- **WHEN** a Task's title is empty
- **THEN** its card shows the Task id instead of empty text

### Requirement: Band vocabulary

The map SHALL be divided into Bands. The curated Bands SHALL be a set of Task
Label names, persisted per Project, and SHALL be editable by the user. The
curated Bands SHALL carry no order: no Band is first and none is last, so
nothing about a Task's placement depends on which Band was curated before which.

On the first open of a Project's map, the curated set SHALL be seeded with the
Task Label names the Project's active Tasks carry.

The labels offered for curation SHALL be those carried by the Project's active
Tasks. A Task Label that no active Task carries SHALL NOT be offered, because the
plugin SDK exposes no surface that lists a Project's Task Labels.

A curated label that no active Task currently carries SHALL keep its Band, and
that Band SHALL be drawn empty, so a label whose Tasks are all Completed is not
silently dropped from the user's chosen set.

A `No label / Other` Band SHALL always be present and SHALL NOT be removable,
because a Task carrying no curated label would otherwise have no card on the map.

An edited curated set SHALL reach storage before the map shows it, and a store
that refuses SHALL leave the editor open with the reason, because a set the user
chose in a dialog and cannot see again is a set they will not know to choose
twice.

#### Scenario: First open seeds the curated set

- **WHEN** a user opens the Task Map View for a Project that has no curated set
  yet
- **THEN** the curated set contains every Task Label carried by that Project's
  active Tasks

#### Scenario: Label offered for curation

- **WHEN** a user edits the curated set
- **THEN** the labels offered are those carried by the Project's active Tasks

#### Scenario: Curated label falls out of use

- **WHEN** every Task carrying a curated label becomes Completed
- **THEN** that label keeps its Band
- **AND** its Band is drawn empty

#### Scenario: The Other Band cannot be removed

- **WHEN** a user edits the curated set
- **THEN** no control to remove the `No label / Other` Band is offered

#### Scenario: Removing a Band re-bands its Tasks

- **WHEN** a user removes the curated Band `auth`
- **THEN** the `auth` Band is gone from the map
- **AND** a Task that carried only `auth` is drawn in the `No label / Other` Band

#### Scenario: A curated set that cannot be stored

- **WHEN** a user saves a curated set and the store refuses the write
- **THEN** the editor stays open and reports the reason
- **AND** the map still shows the Bands it showed before

### Requirement: Band membership

A Task SHALL be drawn in every curated Band whose label it carries. A Task
carrying several curated labels SHALL therefore be drawn once per matching Band,
and each of those cards SHALL open the same Task.

A Task carrying no curated label SHALL be drawn in the `No label / Other` Band.
A Task carrying at least one curated label SHALL NOT be drawn in the
`No label / Other` Band.

A card's Band SHALL be decided by the Task's labels alone and never by where the
card sits, because no supported interface writes Task Labels, so a card dropped
over another Band could not change the Task it stands for.

A change to a Task's labels, or to the curated set, that changes which Bands a
Task belongs to SHALL add and remove that Task's cards to match.

#### Scenario: Task carries one curated label

- **WHEN** a Task carries the curated label `auth`
- **THEN** one card is drawn for it, inside the `auth` Band

#### Scenario: Task carries several curated labels

- **GIVEN** the curated set is `auth` and `api`
- **WHEN** a Task carries both `auth` and `api`
- **THEN** one card is drawn for that Task inside the `auth` Band
- **AND** one card is drawn for that Task inside the `api` Band
- **AND** clicking either card opens the same Task

#### Scenario: Task carries no curated label

- **WHEN** a Task carries no label in the curated set
- **THEN** one card is drawn for it inside the `No label / Other` Band

#### Scenario: Task gains a curated label

- **GIVEN** a Task drawn only in the `No label / Other` Band
- **WHEN** that Task gains the curated label `auth`
- **THEN** a card for it is drawn in the `auth` Band
- **AND** its card in the `No label / Other` Band is removed

### Requirement: Band placement

A Band SHALL be a rectangle the user places freely on the canvas. A user SHALL
be able to drag a Band by its heading and to resize it by its corner. A Band's
placement SHALL be persisted per Project and SHALL be restored when the View is
reopened and when the app restarts.

Dragging a Band SHALL carry its cards with it, because a card's position is held
as an offset inside its own Band.

A Band SHALL be laid out to fit the cards the map places in it: resizing a Band
narrower SHALL reflow its rows, and a Band SHALL NOT be drawn shorter than the
rows it holds. A Band SHALL never be drawn narrower than one card.

Bands SHALL be allowed to overlap, because the user places them and no rule
keeps two rectangles apart.

On the first open of a Project's map, Bands SHALL be seeded stacked one under
another, each sized to fit its own cards, so a first open reads top to bottom
before the user moves anything.

#### Scenario: Band placement survives a reopen

- **WHEN** a user drags a Band, closes the View, and opens it again
- **THEN** the Band is where the user left it

#### Scenario: Dragging a Band carries its cards

- **GIVEN** a user has placed a card inside the `auth` Band
- **WHEN** the user drags the `auth` Band across the canvas
- **THEN** the card keeps its place inside the Band and moves with it

#### Scenario: Resizing a Band reflows its rows

- **WHEN** a user makes a Band narrow enough to hold fewer cards per row
- **THEN** the cards the map placed reflow into more rows
- **AND** the Band is not drawn shorter than those rows

#### Scenario: Bands overlap

- **WHEN** a user drags one Band over another
- **THEN** both Bands stay drawn where the user put them

### Requirement: Derived dependency arrows

The map SHALL draw an arrow for each `dependsOn` entry whose target has a card on
the map. An arrow SHALL be directional, so a viewer can tell which Task waits on
which: it SHALL leave the Task depended on and SHALL point at the Task that
waits.

Where either Task is drawn in several Bands, an arrow SHALL be drawn between
every pair of their cards, so no card is left looking unconnected.

A pair of cards SHALL carry one arrow per direction. A `dependsOn` list that
repeats the same target SHALL draw one arrow per card pair, and a Task listing
itself SHALL draw none, because neither can be told apart from the single arrow
on screen. No arrow SHALL join two cards standing for the same Task.

An arrow SHALL stay visible where it passes a card, because an arrow hidden
under a card reads as two unconnected stubs.

An arrow SHALL be drawn whether its two cards sit in the same Band or in
different Bands.

A `dependsOn` entry whose target has no card on the map SHALL NOT be drawn. This
covers a dependency on a Completed Task, which is a satisfied dependency, and a
dependency on a Task that no longer exists.

The map SHALL NOT offer any way to create, edit, or delete a relation, because
no supported interface writes `dependsOn` on a Task that already exists.

A cyclic `dependsOn` chain SHALL NOT prevent the map from drawing. Every card in
the cycle SHALL still be placed and every arrow within the cycle SHALL still be
drawn.

#### Scenario: Dependency between two active Tasks

- **WHEN** Task A lists Task B in `dependsOn` and both are active
- **THEN** an arrow is drawn between the two cards showing that A waits on B
- **AND** the arrow points at A

#### Scenario: Dependency reaches a Task drawn in two Bands

- **GIVEN** Task B is drawn in both the `auth` and the `api` Band
- **WHEN** Task A lists Task B in `dependsOn`
- **THEN** an arrow is drawn from each of B's two cards to A's card

#### Scenario: Repeated or self dependency

- **WHEN** Task A lists Task B twice in `dependsOn`, and also lists itself
- **THEN** one arrow is drawn, from B to A

#### Scenario: Dependency crosses a Band

- **WHEN** Task A in the `auth` Band lists Task B in the `api` Band
- **THEN** the arrow is drawn between the two Bands

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

A card without a stored position SHALL be placed by the map inside its own Band,
ordered by how deep it sits in the dependency chain, so a first open can be read
from its least dependent cards to its most dependent ones.

A user SHALL be able to drag a card. A stored position SHALL be held as an offset
inside the card's own Band, SHALL be persisted per Task per Band per Project, and
SHALL be restored when the View is reopened and when the app restarts.

A stored position SHALL take priority over the map's own placement.

A drag SHALL NOT be confined to the card's Band. A card MAY come to rest outside
its own Band's rectangle, and doing so SHALL change neither the Task nor which
Band the card belongs to.

Where a Task is drawn in several Bands, dragging one of its cards SHALL move only
that card, because each card holds its own offset inside its own Band.

Concurrent position writes SHALL NOT lose each other. A user dragging several
cards in quick succession SHALL find every one of those positions restored on
reopen, because the underlying store offers no atomic update and a plain
read-modify-write would discard the earlier drag.

A stored position for a card that is no longer on the map SHALL NOT affect any
other card.

#### Scenario: First open places cards automatically

- **WHEN** a user opens a Project's map for the first time
- **THEN** every card is placed inside its Band
- **AND** a Task appears after the Tasks it depends on

#### Scenario: Position survives a reopen

- **WHEN** a user drags a card, closes the View, and opens it again
- **THEN** the card is at the position the user left it

#### Scenario: Card rests outside its Band

- **WHEN** a user drags a card past the edge of its own Band and releases
- **THEN** the card rests where it was dropped
- **AND** the Task's labels are unchanged
- **AND** the card still belongs to the Band it was dragged out of

#### Scenario: Dragging one copy of a Task

- **GIVEN** a Task is drawn in both the `auth` and the `api` Band
- **WHEN** the user drags its card in the `auth` Band
- **THEN** only that card moves
- **AND** its card in the `api` Band stays where it was

#### Scenario: Several drags in quick succession

- **WHEN** a user drags three cards one after another and reopens the View
- **THEN** all three cards are at their dragged positions

#### Scenario: Task leaves the map

- **WHEN** a Task with a stored position becomes Completed
- **THEN** its cards are removed
- **AND** every remaining card keeps its own position

### Requirement: Opening a Task from the map

Clicking a card SHALL open that Task on the host board. The map SHALL NOT
present its own Task detail panel.

#### Scenario: User clicks a card

- **WHEN** a user clicks a card on the map
- **THEN** the host board opens with that Task selected
