## 1. Package scaffold and dependencies

- [x] 1.1 Create `plugins/pr-lens` with `package.json`, `tsconfig.json`, `vite.config.ts`, `vite.backend.config.ts`, and `vitest.config.ts` modelled on `plugins/handoff-notes-workflow`; verify `pnpm install` completes and `pnpm --filter @kvg/openforge-pr-lens exec node -e "0"` resolves the new workspace package.
- [x] 1.2 Add `@coldtea/pr-lens-schema` and `@coldtea/pr-lens-renderer` as exact runtime dependencies outside the catalog, per D9; verify a smoke test imports `safeParseGraphDoc` and `render` and passes under `npm test`.
- [x] 1.3 Write the `package.json#openforge` manifest block (`dev.kvg.pr-lens`, frontend, backend, `frontendStyles`, `requires: [backend, commands, context, events, settings, storage, taskPane, tasks]`); verify `npm run build` emits every file the manifest declares.
- [x] 1.4 Commit a valid `GraphDoc` fixture and a schema-invalid variant under `src/__fixtures__`; verify a test asserts `safeParseGraphDoc` accepts the first and rejects the second.

## 2. Stored diagram record

- [x] 2.1 Define the stored record (`document`, `sessionId`, `storedAt`, `cleanliness`) and task-scoped load/save helpers; verify unit tests cover absent, present, and replacement, per the Diagram storage scope requirement.
- [x] 2.2 Assert task-scoped isolation, that a record written for one Task is not readable for another; verify a test covers two Tasks in one Project.
- [x] 2.3 Derive staleness by comparing the recorded `sessionId` against the Task's newest session from `tasks.listSessions`; verify unit tests cover same session, newer session, and no session, per the Diagram provenance and staleness requirement.
- [x] 2.4 Derive the displayed provenance from `document.provenance.head`, `document.provenance.repo`, `storedAt`, and `cleanliness`, treating absent cleanliness as unknown rather than clean; verify a unit test asserts the unknown case is not reported as clean.

## 3. Backend: accepting a document from the Agent

- [x] 3.1 Register the agent-facing backend command with its input and output JSON schemas and `agent` metadata; verify a `createOpenForgeRegistryFake` activation test asserts the qualified command id and a non-empty agent description.
- [x] 3.2 Validate the submitted document with `safeParseGraphDoc`, which already enforces referential integrity, returning `formatIssues` output on failure; verify tests cover the valid fixture, a schema-invalid document, and an integrity-invalid document.
- [x] 3.3 Retain the Task's previous record when validation fails; verify a test seeds a stored record, submits an invalid document, and asserts the stored record is unchanged.
- [x] 3.4 Stamp `sessionId` from the newest `tasks.listSessions` row and `storedAt` from the plugin clock on write, and accept the Agent-reported cleanliness; verify a test asserts all three land in the stored record.
- [x] 3.5 Reject invocation with no OpenForge Task context; verify a test asserts the error names the missing Task context.
- [x] 3.6 Emit the diagram-updated plugin event after a successful write; verify a test asserts the emission and its `taskId` payload.

## 4. Prompt template and settings

- [x] 4.1 Write the default template covering the graph-document contract, the required `provenance` fields, and the exact `openforge plugin command invoke --command-id dev.kvg.pr-lens.<id>` line; verify a test asserts it is non-empty, contains the qualified command id, and does not ask for `provenance.pullRequest`.
- [x] 4.2 Implement project-scoped template load and save with a blank save restoring the default; verify tests cover never-configured, custom, cleared, and two Projects holding different templates, per the Project-owned prompt template requirement.
- [x] 4.3 Build the project-scoped settings section component and register it; verify a component test covers editing, saving, and the blank-save restore, and an activation test asserts the registration is `scope: 'project'`.

## 5. Frontend: tab registration and visibility

- [x] 5.1 Register the PR Lens task tab with `requiresWorkspace: false`; verify an activation test asserts the registration and its id.
- [x] 5.2 Register the tab once for every Task, per D10; verify an activation test asserts the tab is registered for a Task that never ran.
- [x] 5.3 Gate the request control on `tasks.listSessions` inside the pane, per D3; verify a component test covers a Task with no session offering no control and still drawing a stored diagram.
- [x] 5.4 Dispose every subscription and registration on plugin deactivation; verify a registry-fake test asserts the snapshot is empty after deactivation.

## 6. Diagram rendering

- [x] 6.1 Re-validate the stored document with `safeParseGraphDoc` before rendering and route a failure to the error state, per D8; verify a test seeds a stored document that no longer validates and asserts the error state names the failure.
- [x] 6.2 Render with `render(doc, { lens, theme })` and inject the returned SVG, selecting the theme from the host appearance; verify tests assert light and dark produce different output and that switching appearance re-renders.
- [x] 6.3 Offer a lens selector when `document.lenses` declares more than one, defaulting to the first; verify tests cover a single-lens document showing no selector and a two-lens document switching between them.
- [x] 6.4 Catch `PrLensRenderError` and show the error state rather than a blank tab; verify a test forces a render failure and asserts the stored document is retained.
- [x] 6.5 Render the empty state offering the request control when the Task has no stored record; verify a test asserts the empty state for a Task with a session and no document.
- [x] 6.6 Repaint on the diagram-updated plugin event, per the Diagram presentation requirement; verify a test emits the event for the mounted Task and asserts the new diagram replaces the old without a remount.
- [x] 6.7 Show the provenance line and the stale and uncommitted markers from task 2.3 and 2.4; verify tests cover fresh, stale, uncommitted, and unknown-cleanliness records.

## 7. Requesting a diagram

- [x] 7.1 Wire the request control to `tasks.sendFollowUp` with the Project's resolved template; verify a test asserts the message sent equals the resolved template for that Project.
- [x] 7.2 Report `delivered` and `queued` dispositions distinguishably; verify tests cover both receipts, per the Requesting a diagram requirement.
- [x] 7.3 Catch `TaskFollowUpError` and report the failure with its reason, leaving any stored diagram on screen; verify tests cover `NO_SESSION` and `DELIVERY_FAILED`.
- [x] 7.4 Disable the control while a request is in flight so one click cannot queue several prompts; verify a test asserts a second click during an unresolved send is ignored.

## 8. Documentation

- [x] 8.1 Write `plugins/pr-lens/README.md` covering what the plugin does, the Agent round trip, and how to edit the template; verify the file exists and names the qualified command id.
- [x] 8.2 Add a PR Lens plugin section to `CONTEXT.md` defining the plugin-owned terms this change introduces, in the same form as the existing plugin sections; verify the glossary entries carry their `_Avoid_` lines.
- [x] 8.3 Add the `dev.kvg.pr-lens` row to the plugin-id table in `AGENTS.md`; verify the table lists all six plugins.

## 9. Build, install, and reload

- [x] 9.1 Run `npm test && npm run typecheck` in `plugins/pr-lens`; verify both pass with no skipped suites.
- [x] 9.2 Run `npm run build`; verify `dist/frontend.js`, `dist/backend.js`, and the declared stylesheet are emitted and match the manifest entries.
- [x] 9.3 Run `openforge plugin install --path plugins/pr-lens`, required because the manifest is new; verify the install reports success.
- [x] 9.4 Enable the plugin for the Project from `openforge project list` and run `openforge plugin reload --plugin-id dev.kvg.pr-lens --project-id <project-id>`; verify the response is `"reloaded": true`.
- [ ] 9.5 Confirm the round trip in the running app on a Task with a finished Agent Session: request a diagram, let the Agent return a document, and verify the tab paints it with its provenance line.
- [ ] 9.6 Confirm a backlog Task that has never run shows the tab with no request control; verify by opening such a Task and reading its PR Lens tab.

## 10. Lens declaration in the default prompt

- [x] 10.1 Tighten `DEFAULT_PROMPT_TEMPLATE` in `plugins/pr-lens/src/prLensTemplate.ts` so it describes `flows` and ties the `data-flow` lens to writing them; cover it in `prLensTemplate.test.ts` and verify the default names `flows` alongside its lens instruction.
- [x] 10.2 Run `npm test && npm run typecheck && npm run build` in `plugins/pr-lens`, then `openforge plugin reload --plugin-id dev.kvg.pr-lens --project-id <project-id>`; verify the response is `"reloaded": true`.
- [ ] 10.3 Name the required `delta` on `nodes` and `edges` in `DEFAULT_PROMPT_TEMPLATE`, which the prompt omits today and the schema rejects a document without; cover it by extending the flow parse test to the whole document the template describes.
