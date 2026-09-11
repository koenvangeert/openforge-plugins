## 1. Package scaffold

- [x] 1.1 Create `plugins/task-map` with `package.json`, `tsconfig.json`, `vite.config.ts`, and `vitest.config.ts` modelled on `plugins/jira` but with no `vite.backend.config.ts` and a single `vite build`; verify `pnpm install` completes and `npm run build` emits `dist/frontend.js` plus the declared stylesheet.
- [x] 1.2 Write the `package.json#openforge` manifest block (`dev.kvg.task-map`, `frontend`, `frontendStyles`, no `backend`, `requires: [views, tasks, storage, navigation, context]`); verify `npm run build` emits every file the manifest declares.
- [x] 1.3 Add a `TaskDetail` fixture builder under `src/__fixtures__` covering title, status, labels, and `dependsOn`; verify a test builds a Project of active Tasks with a multi-label Task, a cyclic pair, and a Task with no labels.

## 2. Pure map assembly

- [x] 2.1 Implement Region assembly from a curated label order plus the active Tasks: one band per curated label in order, `No label / Other` last and not reorderable; verify unit tests cover an empty curated order, a curated label no Task carries, and a Task carrying no curated label, per the Region vocabulary requirement.
- [x] 2.2 Implement the primary-label rule so a Task appears in exactly one Region, the first curated label it carries; verify a unit test asserts a Task with `[auth, api]` under curated order `auth, api` yields one card in `auth` and none in `api`, and that reversing the order moves it, per the Primary Region assignment requirement.
- [x] 2.3 Implement the seeded curated order from the label names the active Tasks carry; verify a unit test asserts first-open seeding and that a label carried by no active Task is not seeded, per the Region vocabulary requirement.
- [x] 2.4 Implement arrow selection: one arrow per `dependsOn` entry whose target is a card on the map, directional, same-Region or cross-Region, and none for a target that is absent; verify unit tests cover a same-Region edge, a cross-Region edge, and an edge to a Completed Task, per the Derived dependency arrows requirement.
- [x] 2.5 Implement Region-local longest-path layering with a visited-set cycle guard, stable by Task id within a row; verify unit tests cover a linear chain, a diamond, a two-Task cycle, and a three-Task cycle, and assert the walk terminates, per the Card position and Derived dependency arrows requirements.
- [x] 2.6 Assert every assembly function is pure, taking Tasks and the curated order and returning a model with no `api` and no DOM; verify the assembly test file imports nothing from `@openforge-app/plugin-sdk/frontend`.

## 3. Position store

- [x] 3.1 Implement `regionLabels` and `cardPositions` read and write against `storage.project(projectId)` as two separate keys; verify unit tests with the SDK storage fake cover absent, present, and replacement for each key independently.
- [x] 3.2 Store a position as a Region-relative offset and resolve it against the Region's current origin at render time; verify a unit test grows a band above a card and asserts the card stays inside its own band, per the Card position requirement.
- [x] 3.3 Serialize every position write per Project through one promise chain that continues past a rejection, mirroring `plugins/issues/src/backend/boardStore.ts:serializePerProject`; verify a test issues three overlapping writes for different Tasks and asserts all three positions survive, per the Card position requirement.
- [x] 3.4 Debounce position writes to the end of a drag gesture; verify a test emits many position updates for one card and asserts a single write reaches storage.
- [x] 3.5 Discard a Task's stored position when its primary Region changes, and leave positions for Tasks absent from the map untouched; verify unit tests cover a relabel that moves a Region and a Completed Task whose neighbours keep their positions, per the Drag is clamped and Card position requirements.
- [x] 3.6 Assert project isolation, that positions and the curated order written for one Project are not readable for another; verify a test covers two Projects.

## 4. View and rendering

- [x] 4.1 Register the Task Map rail View in the frontend entry with its id, title, icon, and placement; verify a `createOpenForgeRegistryFake` activation test asserts the registration and that disposal removes it.
- [x] 4.2 Render stacked Region bands with headings and absolutely positioned cards, using `PluginPageShell` and `PluginPageHeader` from the SDK UI layer; verify a component test asserts one band per Region in curated order with `No label / Other` last.
- [x] 4.3 Render a card showing its Task title, falling back to the Task id when the title is empty, and distinguishing `backlog` from `doing`; verify component tests cover both statuses and the empty title, per the Card set requirement.
- [x] 4.4 Render directional arrows between cards from the assembled arrow list, including cross-Region arrows; verify a component test asserts an arrow element per expected edge and none for an edge to an absent Task.
- [x] 4.5 Implement the empty states: no active Project, and a Project whose every Task is Completed, using `PluginViewState`; verify component tests cover both, per the Map availability requirement.
- [x] 4.6 Add pan and zoom over the canvas; verify a component test asserts the rendered transform changes and that card hit targets follow it.

## 5. Drag

- [x] 5.1 Implement card drag with the drop clamped to the card's own Region band; verify a component test drags a card past its band boundary and asserts it comes to rest inside its own band, per the Drag is clamped to the Region requirement.
- [x] 5.2 Assert a cross-Region drag attempt performs no Task write; verify a test asserts no `tasks` mutation call is recorded on the API fake.
- [x] 5.3 Restore stored positions on mount so a stored position takes priority over layering; verify a component test seeds a position, mounts, and asserts the card renders there rather than at its layered row, per the Card position requirement.

## 6. Region curation

- [ ] 6.1 Build the Region order editor as an in-view modal offering the labels the active Tasks carry, modelled on `plugins/issues/src/components/ColumnSettingsModal.svelte`; verify a component test asserts the offered labels and that saving persists the new order.
- [ ] 6.2 Assert a curated label carried by no active Task keeps its place and renders an empty band; verify a component test covers it, per the Region vocabulary requirement.

## 7. Task reads and navigation

- [x] 7.1 Load the map from `tasks.active(projectId)` on mount and on Project change, guarded by an activation counter in the style of `useIssuesBoard.svelte.ts:isCurrentActivation`; verify a test resolves a stale read after a Project switch and asserts it is discarded, per the Map availability requirement.
- [x] 7.2 Subscribe to `tasks.onDidChange(projectId, ...)` and re-run the bounded read rather than patching from the event, disposing on teardown; verify tests cover a created Task appearing, a Completed Task disappearing with its arrows, and a coalesced burst producing a re-read, per the Card set requirement.
- [x] 7.3 Open a Task on click with `navigation.navigate({ viewId: 'board', taskId })`; verify a component test asserts the recorded navigate call, per the Opening a Task from the map requirement.
- [x] 7.4 Assert the map offers no relation editing and no Task detail panel; verify a component test asserts no add, edit, or remove dependency control renders on a card or an arrow, per the Derived dependency arrows requirement.

## 8. Documentation and delivery

- [ ] 8.1 Add a Task Map glossary section to `CONTEXT.md` covering Region, primary label, and derived arrow; verify the terms used in the code match the glossary entries.
- [x] 8.2 Add the `dev.kvg.task-map` row to the plugin-id table in `AGENTS.md`; verify the table lists the plugin.
- [x] 8.3 Write `plugins/task-map/README.md` stating what the map derives and what it cannot change; verify it names the two read-only limits (`dependsOn` and Task Labels).
- [x] 8.4 Run `npm test && npm run typecheck && npm run build`, install the plugin from its local path, enable it for the Project, and reload it; verify the reload reports `"reloaded": true`, per the test/build/reload cycle in `AGENTS.md`.
