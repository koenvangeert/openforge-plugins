# @kvg/openforge-jira

A Trusted Plugin (`dev.kvg.jira`) that links OpenForge **Tasks** to **Jira
Cloud** issues and browses issues by JQL. Read-only, Jira Cloud only. Designed in
KVG-1219; credential trade-off recorded in
[`docs/adr/0002`](../../docs/adr/0002-jira-credentials-in-plaintext-plugin-storage.md).

## Surfaces

- **Rail view** (`views.register`) — runs the active Project-owned Intake Filter,
  supports raw JQL, and follows Jira continuation tokens without a silent cutoff.
- **Settings section** (`settings.registerSection`) — Jira site, email and API
  token.
- **Linked Issue Section** (`taskUI.registerSection`) — present in every Task's
  detail stack. It shows compact, read-only Jira context for the explicit Issue
  Link at `storage.task(taskId)`, or an unlinked state with a user-confirmed
  key-shaped hint scanned from Task text.

## Styling

Components style themselves with the **host's daisyUI/Tailwind utility classes**
(`btn`, `badge`, `alert`, `input`/`textarea` `-bordered`, `text-base-content/*`),
not scoped `<style>` blocks: an external plugin's emitted CSS is not loaded by
the host, so shipped styles are dead. Match the built-in plugins.

## Architecture

All Jira HTTP runs in the **backend** (`backend.registerMethod`); the renderer
calls `api.backend.invoke` and never touches `*.atlassian.net` (CORS + token
exposure). The backend reads credentials from `storage.global` and uses Basic
auth (`base64(email:token)`) against Jira Cloud REST v3:

- `GET /rest/api/3/issue/{key}?expand=renderedFields`
- `POST /rest/api/3/search/jql`
- `GET /rest/api/3/myself` (settings "Test connection")

Backend methods return a discriminated result (`{ ok: true, … }` /
`{ ok: false, error, message }`) so each failure state (no/invalid credentials,
issue-not-found, network, invalid JQL) renders distinctly.

`lib/intakeController.ts` exposes reusable `createIntakeTask` and
`createAndStartIntakeTask` operations for the Intake Workspace. Both scope
duplicate checks and Task creation to the active Project, then store the Issue
Link in task-scoped plugin storage. The start operation links the created Task
before requesting its native OpenForge Implementation Run and returns a typed
partial-success result if that request fails.

Issue descriptions are Jira's rendered HTML (`renderedFields.description`),
sanitized in the renderer with `@openforge-app/plugin-sdk/sanitize` before
`{@html}`.

The Linked Issue Section refreshes when opened and through its own **Refresh**
action only (no background polling); the last loaded issue and successful
refresh time are cached in `storage.task`. The global **Refresh Jira** command
refreshes the Intake Workspace, not Task sections.

## Credentials & security

The API token is stored **plaintext** in the plugin's `storage.global` file — the
SDK exposes no secrets API and the OS keyring is core-only. This is an accepted,
documented limitation (ADR 0002), mitigated by keeping the token out of the
renderer and doing all HTTP in the backend.

## Build & test

```bash
pnpm --filter @kvg/openforge-jira build   # dist/frontend.js + dist/backend.js
pnpm --filter @kvg/openforge-jira test
pnpm --filter @kvg/openforge-jira typecheck
```

Install the built `plugins/jira` directory into OpenForge as a local path source,
then enable it per project.
