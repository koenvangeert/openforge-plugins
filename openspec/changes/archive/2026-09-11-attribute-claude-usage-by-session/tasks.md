## 1. Session identity on the read path

- [x] 1.1 Expose the transcript each Spend Index row came from in `iterateRows`, and verify a `spendIndex.test.ts` case asserts the session id parsed from a `<dir>/<uuid>.jsonl` path and a null id for a path that is not a session filename
- [x] 1.2 Verify no serialized format change is needed by asserting `parseSpendIndex(serializeSpendIndex(index))` round-trips an index written before this change

## 2. Attribution model

- [x] 2.1 Split `buildAttributionMap` into a Project directory map (Project checkouts plus Task workspace paths, longest prefix wins) and a session-to-Task map, and verify `attribution.test.ts` covers a worktree outside every checkout resolving to its Task's Project
- [x] 2.2 Drop Task resolution from the directory map and verify a test asserts an in-place Task's directory resolves to its Project and to no Task
- [x] 2.3 Resolve a Task from a session id and verify tests cover a hit, a miss, and several sessions summing onto one Task

## 3. Reading Agent Sessions

- [x] 3.1 Build the session-to-Task map in `spendService.ts` from `openforge.agentSessions.list` with `provider: 'claude-code'`, and verify a `spendService.test.ts` case asserts the request carries one immutable `overlaps` interval across every page
- [x] 3.2 Follow `nextCursor` until exhausted and verify a test with two pages asserts both pages' sessions land in the map
- [x] 3.3 Skip an item whose `providerSessionId` is null and verify a test asserts it contributes no Task attribution and logs nothing user-facing
- [x] 3.4 Keep the existing attribution cache TTL and verify a test asserts a second read inside the TTL issues no further host calls
- [x] 3.5 Verify the manifest is unchanged by asserting `package.json#openforge.requires` still lists `tasks` and no new capability

## 4. Dashboard and Task pane

- [x] 4.1 Attribute the Dashboard's Task axis by session and its Project axis by directory as independent passes, and verify `dashboard.test.ts` asserts a Billed Response counted on both axes is not double-counted in any total
- [x] 4.2 Verify a `dashboard.test.ts` case asserts totals, daily series, Project axis, and per-model breakdown are byte-identical when the session map is empty
- [x] 4.3 Switch `buildTaskSpend` to the session rule and verify tests cover found-with-spend, found-priced-to-zero, and not-found
- [x] 4.4 Render the em dash for a Task with no attributable session in `TaskSpendSection.svelte` and verify `TaskSpendSection.test.ts` asserts the three states: `…` while loading, `—` when not found, the amount otherwise

## 5. Language and delivery

- [x] 5.1 Rewrite the **Spend Attribution** entry in `CONTEXT.md` for the two-axis model and verify it names the session identity as the only Task rule and keeps the directory rule for Projects
- [x] 5.2 Run `npm test && npm run typecheck && npm run build` in `plugins/claude-usage` and verify all three succeed
- [x] 5.3 Reload the plugin with `openforge plugin reload --plugin-id dev.kvg.claude-usage --project-id <project-id>` and verify the response reports `"reloaded": true`
- [x] 5.4 Open a Task that runs in its Project checkout and verify its Claude usage row shows a non-zero amount, and open a Task with no recorded session and verify it shows an em dash
