# ADR 0002: Store Jira credentials in plaintext plugin storage, with all Jira HTTP in the backend

Status: Accepted
Date: 2026-06-26
Task: KVG-1219

## Context

The Jira plugin (`dev.kvg.jira`) talks to Jira Cloud's REST API, which requires a
credential: HTTP Basic with `email:apiToken`. That API token is a secret. The
plugin needs somewhere to keep it.

The constraints, established from the SDK and OpenForge core:

- **The plugin SDK exposes no secrets API.** A plugin's only persistence is
  `storage` (`global` / `project` / `task` scopes) and `config` / `projectConfig`
  — all **plaintext JSON on disk**.
- **The OS keyring is core-only.** OpenForge core keeps its own `github_token` in
  an OS `secure_store`, but that is not reachable from a plugin. `github-sync`
  never handles the GitHub token itself; it relays host commands via
  `commands.invokeGlobal('openforge.*')`. There is **no equivalent host-owned Jira
  integration** to relay to — Jira is entirely plugin-owned.
- **Env vars are unreliable as the primary mechanism.** A plugin backend inherits
  the desktop app's environment, not the user's interactive shell. On a macOS GUI
  launch, a token exported in `.zshrc` is not visible unless OpenForge is started
  from a terminal.

So there is no secure at-rest option available to the plugin. The choice is
between a reliable-but-plaintext store and an unreliable-but-not-persisted env var.

## Decision

Store the Jira **site**, **email**, and **API token** in `storage.global`,
configured through a `settings.registerSection` form. Read them **only in the
backend**, and perform **all** Jira HTTP from the backend
(`backend.registerMethod`); the frontend surfaces call it via `api.backend.invoke`.

The token is therefore at plaintext rest in the plugin's `storage.global` file.
We accept this and document it plainly rather than hiding it behind a weaker
scheme.

Backend-owned HTTP is not just about the secret: renderer-side calls to
`*.atlassian.net` would hit CORS, and holding the token in the renderer would
expose it to the DOM and devtools.

## Alternatives considered

- **API token from an env var, only site/email in settings.** Nothing secret is
  persisted by the plugin. Rejected as the primary path: unreliable on macOS GUI
  launch (see Context) and clunky to set up. May be offered later as an optional
  override the backend prefers when present.
- **Wait for / request an SDK secrets capability** backed by the OS keyring.
  The correct long-term answer, but it does not exist today and would block the
  plugin indefinitely. Recorded as the migration target.
- **Relay through a host command** the way `github-sync` does. Not possible —
  there is no host-owned Jira integration to relay to.

## Consequences

Positive:

- Unblocks the plugin today with reliable configuration UX.
- Keeps the secret out of the renderer and avoids CORS by centralizing HTTP in
  the backend.

Negative / costs:

- The API token sits in plaintext in the plugin's `storage.global` file. Anyone
  with filesystem access to the OpenForge data directory can read it. This is a
  real limitation, not a hidden one.

## Follow-up

- If the SDK gains a secrets/keyring capability, migrate the token to it and
  revisit this ADR.
- Consider honoring an env-var override for the token so security-sensitive users
  can avoid plaintext at rest when they launch OpenForge with the env visible.
