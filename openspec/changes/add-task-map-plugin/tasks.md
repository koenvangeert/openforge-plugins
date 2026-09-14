## 1. Package scaffold

- [x] 1.1 Create `plugins/task-map` with `package.json`, `tsconfig.json`, `vite.config.ts`, and `vitest.config.ts` modelled on `plugins/jira` but with no `vite.backend.config.ts` and a single `vite build`; verify `pnpm install` completes and `npm run build` emits `dist/frontend.js` plus the declared stylesheet.
- [x] 1.2 Write the `package.json#openforge` manifest block (`dev.kvg.task-map`, `frontend`, `frontendStyles`, no `backend`, `requires: [views, tasks, storage, navigation, context]`); verify `npm run build` emits every file the manifest declares.
- [x] 1.3 Add a `TaskDetail` fixture builder under `src/__fixtures__` covering title, status, labels, and `dependsOn`; verify a test builds a Project of active Tasks with a multi-label Task, a cyclic pair, and a Task with no labels.

## 2. Pure map assembly

- [x] 2.1 Implement Band assembly from a curated set of Band rectangles plus the active Tasks: one Band per curated entry, plus a `No label / Other` Band that is always present; verify unit tests cover an empty curated set, a curated label no Task carries, and a Task carrying no curated label, per the Band vocabulary requirement.
- [x] 2.2 Implement the membership rule so a Task is drawn once in every curated Band whose label it carries, and only in `No label / Other` when it carries none; verify a unit test asserts a Task with `[auth, api]` yields one card in `auth` and one in `api`, and that removing the `auth` Band leaves only the `api` card, per the Band membership requirement.
- [x] 2.3 Implement the seeded curated set from the label names the active Tasks carry, laid out stacked and sized to fit; verify a unit test asserts first-open seeding and that a label carried by no active Task is not seeded, per the Band vocabulary and Band placement requirements.
- [x] 2.4 Implement arrow selection and expansion: one arrow per `dependsOn` entry whose target has a card, expanded across every pair of the two Tasks' cards, none between two cards of the same Task, and none for an absent target; verify unit tests cover a same-Band edge, a cross-Band edge, an edge into a Task drawn in two Bands, and an edge to a Completed Task, per the Derived dependency arrows requirement.
- [x] 2.5 Implement Band-local longest-path layering that drops a back edge before it walks, stable by Task id within a row, wrapping to the Band's own width; verify unit tests cover a linear chain, a diamond, a two-Task cycle, a three-Task cycle, and a reflow when the Band narrows, and assert the walk terminates, per the Card position and Band placement requirements.
- [x] 2.6 Assert every assembly function is pure, taking Tasks and the curated Bands and returning a model with no `api` and no DOM; verify the assembly test file imports nothing from `@openforge-app/plugin-sdk/frontend`.

## 3. Placement store

- [x] 3.1 Implement `bands` and `cardPositions` read and write against `storage.project(projectId)` as two separate keys, each an array carrying its own identity; verify unit tests with the SDK storage fake cover absent, present, replacement, and a stored value of the wrong shape for each key independently.
- [x] 3.2 Store a card position as an offset inside its own Band and resolve it against the Band's current corner at render time; verify a unit test moves a Band and asserts its cards move with it, per the Band placement requirement.
- [x] 3.3 Serialize every placement write per Project through one promise chain that continues past a rejection, mirroring `plugins/issues/src/backend/boardStore.ts:serializePerProject`; verify a test issues three overlapping writes for different cards and asserts all three positions survive, per the Card position requirement.
- [x] 3.4 Write placement once, at the end of a drag gesture; verify a test emits many position updates for one card and asserts a single write reaches storage.
- [x] 3.5 Key a card position by Task and Band together, so dragging one copy of a multi-Band Task moves only that copy, and leave positions for cards absent from the map untouched; verify unit tests cover both, per the Card position requirement.
- [x] 3.6 Assert project isolation, that placement written for one Project is not readable for another; verify a test covers two Projects.

## 4. View and rendering

- [x] 4.1 Register the Task Map rail View in the frontend entry with its id, title, icon, and placement; verify a `createOpenForgeRegistryFake` activation test asserts the registration and that disposal removes it.
- [x] 4.2 Render Band rectangles with headings and absolutely positioned cards, using `PluginPageShell` and `PluginPageHeader` from the SDK UI layer; verify a component test asserts one Band per curated entry plus `No label / Other`, each at its stored rectangle.
- [x] 4.3 Render a card showing its Task title, falling back to the Task id when the title is empty, and distinguishing `backlog` from `doing`; verify component tests cover both statuses and the empty title, per the Card set requirement.
- [x] 4.4 Render directional arrows between cards from the assembled arrow list, including cross-Band arrows and arrows to each copy of a multi-Band Task; verify a component test asserts an arrow element per expected edge and none for an edge to an absent Task.
- [x] 4.5 Implement the empty states: no active Project, and a Project whose every Task is Completed, using `PluginViewState`; verify component tests cover both, per the Map availability requirement.
- [x] 4.6 Add pan and zoom over the canvas; verify a component test asserts the rendered transform changes and that card hit targets follow it.

## 5. Drag

- [x] 5.1 Implement card drag with no clamp, so a card rests where it is dropped even outside its own Band; verify a component test drags a card past its Band edge and asserts it rests there and still belongs to that Band, per the Card position requirement.
- [x] 5.2 Implement Band drag by its heading and Band resize by its corner, persisting the rectangle; verify component tests assert the cards move with the Band and that narrowing it reflows the rows, per the Band placement requirement.
- [x] 5.3 Assert a card dragged over another Band performs no Task write; verify a test asserts no `tasks` mutation call is recorded on the API fake.
- [x] 5.4 Restore stored placement on mount so a stored card position takes priority over layering; verify a component test seeds a position, mounts, and asserts the card renders there rather than at its layered row, per the Card position requirement.

## 6. Band curation

- [x] 6.1 Build the Band editor as an in-view modal offering the labels the active Tasks carry, modelled on `plugins/issues/src/components/ColumnSettingsModal.svelte` but curating a set rather than an order; verify a component test asserts the offered labels and that saving persists the new set.
- [x] 6.2 Assert a curated label carried by no active Task keeps its Band and renders it empty, and that `No label / Other` offers no remove control; verify component tests cover both, per the Band vocabulary requirement.
- [x] 6.3 Assert removing a curated Band moves the Tasks that carried only that label into `No label / Other`; verify a component test covers it, per the Band membership requirement.
- [x] 6.4 Store an edited curated set before the map shows it, and keep the editor open with the reason when the store refuses; verify a component test refuses the write and asserts the Bands on screen are unchanged, per the Band vocabulary requirement.

## 7. Task reads and navigation

- [x] 7.1 Load the map from `tasks.active(projectId)` on mount and on Project change, guarded by an activation counter in the style of `useIssuesBoard.svelte.ts:isCurrentActivation`; verify a test resolves a stale read after a Project switch and asserts it is discarded, per the Map availability requirement.
- [x] 7.2 Subscribe to `tasks.onDidChange(projectId, ...)` and re-run the bounded read rather than patching from the event, disposing on teardown; verify tests cover a created Task appearing, a Completed Task disappearing with its arrows, and a coalesced burst producing a re-read, per the Card set requirement.
- [x] 7.3 Open a Task on click with `navigation.navigate({ viewId: 'board', taskId })`; verify a component test asserts the recorded navigate call, per the Opening a Task from the map requirement.
- [x] 7.4 Assert the map offers no relation editing and no Task detail panel; verify a component test asserts no add, edit, or remove dependency control renders on a card or an arrow, per the Derived dependency arrows requirement.

## 8. Documentation and delivery

- [x] 8.1 Add a Task Map glossary section to `CONTEXT.md` covering Band, membership, and derived arrow; verify the terms used in the code match the glossary entries.
- [x] 8.2 Add the `dev.kvg.task-map` row to the plugin-id table in `AGENTS.md`; verify the table lists the plugin.
- [x] 8.3 Write `plugins/task-map/README.md` stating what the map derives and what it cannot change; verify it names the two read-only limits (`dependsOn` and Task Labels).
- [x] 8.4 Run `npm test && npm run typecheck && npm run build`, install the plugin from its local path, enable it for the Project, and reload it; verify the reload reports `"reloaded": true`, per the test/build/reload cycle in `AGENTS.md`.
