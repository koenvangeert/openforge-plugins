## Context

See `proposal.md` for motivation and `specs/pr-lens-diagram/spec.md` for the
behaviour contract. This section records only what was verified about the two
systems being joined, because several decisions below turn on details that are
not in the plugin authoring guide.

**Host follow-up delivery** (`../openforge/src-tauri/src/agent_follow_up.rs`):

- Eligibility is decided by `disposition_for_status`: `completed` maps to
  `delivered`, `running` and `paused` map to `queued`, everything else raises
  `NO_SESSION`. A finished Task is therefore eligible, which is the case that
  matters most here.
- A missing PTY is not a failure. The host resumes the provider session and
  delivers into the resumed process.
- The message is written as a bracketed paste (`\x1b[200~`), with control
  characters other than newline and tab stripped. A long multi-line prompt
  arrives as one block.
- Lookup is `get_latest_session_for_ticket`, the Task's newest session
  regardless of age.

**SDK surface** (`@openforge-app/plugin-sdk` 0.3.2):

- `tasks.sendFollowUp({ taskId, message })` returns
  `{ taskId, sessionId, disposition }` and throws `TaskFollowUpError` with
  `NO_SESSION` or `DELIVERY_FAILED`.
- `tasks.getLatestSession(taskId)` returns `AgentSession | null`, whose `status`
  is typed as a bare `string`. The SDK testing fake pins it to `null` in both
  0.3.1 and 0.3.2, so nothing built on it can be covered by a test.
  `tasks.listSessions({ taskId })` is newest-first over the same rows, is
  seedable in the fake, and is what this plugin calls instead.
- `shell` is a PTY API (`spawn`, `write`, `resize`, `kill`, `getBuffer`). There
  is no run-a-command-and-capture-stdout call.
- Task tabs take `requiresWorkspace`, defaulting to `true`.

**PR Lens packages** (`@coldtea/pr-lens-schema` 0.2.1,
`@coldtea/pr-lens-renderer` 0.2.2, MIT, `zod` their only transitive dependency):

- `safeParseGraphDoc(...)` plus `formatIssues(...)` and `graphIntegrityIssues(...)`
  give structured, reportable validation failures.
- `render(doc, { lens, theme, view?, config? })` is synchronous, pure, and
  returns `{ svg, width, height, animated, atlas }`. It reads no clock, file, or
  random source, so the same document always produces the same bytes.
- `LENSES` is `['architecture', 'data-flow']`; `THEMES` is `['dark', 'light']`.
- `GraphDoc.provenance` is **required** and already carries `repo`, `base.sha`,
  and `head.sha`. `GraphDoc.generatedAt` is optional.

## Goals / Non-Goals

**Goals:**

- Keep every byte of the pipeline local after install. No network call at
  request, validate, store, or render time.
- Make an invalid Agent result a self-correcting loop between the Agent and the
  plugin, with no user in it.
- Depend only on documented SDK surface, so a host upgrade cannot silently
  disable the feature.

**Non-Goals:**

- **Drill-down views.** The schema supports a view tree (`MAX_VIEWS`,
  `findView`, `resolveScope`) and the renderer can scope to one. This design
  renders the top-level document per lens only. Adding a view navigator later
  changes the tab, not the stored artifact or the contract.
- **Baseline system maps.** `applyPatchDoc` and the CLI's `export` keep a
  repository-level map current across pull requests. That is a separate,
  Project-scoped artifact with its own lifecycle.
- **Repository corrections.** `render` accepts a `config` overlay from a
  repo-local corrections file. Not read in this change.
- **Pull-request provenance.** `provenance.pullRequest` is optional in the
  schema and the default template does not ask the Agent to fill it. The plugin
  works from the OpenForge Task and nothing else, so it has no pull request to
  name and gains nothing by teaching the Agent to look for one.

## Decisions

### D1. The Task's own Agent produces the graph document

The diff-to-graph step is the only part of PR Lens that needs a model. The
Agent has just written the diff, already has repository context loaded, and is
already being paid for.

Alternatives rejected:

- **Plugin-hosted LLM call.** Would work on a Task with no live Agent, but adds
  an API key, a model setting, a provider abstraction, and a second prompt to
  maintain against PR Lens upstream. It also puts spend behind a button in a
  plugin whose whole value is a picture.
- **Shell out to `@coldtea/pr-lens-cli analyze`.** Keeps the prompt upstream,
  but still needs a key, and the `shell` capability is a PTY API, so capturing
  the CLI's output means scraping a terminal buffer.
- **Read the GitHub App's sticky comment.** Zero model cost and exactly what
  reviewers see, but only after a pull request exists and the App has run,
  which is strictly later than the moment this change targets.

### D2. The trigger is a control in the tab that pastes a prompt into the PTY

`tasks.sendFollowUp` is the only supported way to put text in front of a running
Agent. The bracketed-paste framing confirmed above makes a multi-line prompt
safe to send as a single message.

Alternative rejected: **a start-prompt contribution with a cadence rule**, as
`handoff-notes-workflow` uses. That injects on every run whether or not a
diagram is wanted, and spends tokens on Tasks nobody will look at a picture of.
Diagrams are worth asking for, not worth producing by default.

### D3. The request control is keyed on session existence, not on session status

Offer the request control when the Task has at least one row in
`tasks.listSessions({ taskId })`.

Mirroring the host's own predicate (`status` in `completed`, `running`,
`paused`) would hide the tab in exactly the cases where a click would fail. It
was rejected anyway: `AgentSession.status` is typed as a bare `string` and
`disposition_for_status` is a private Rust function. Encoding those three
literals in the plugin means a new host status silently removes the feature with
no error anywhere, which is the worst failure shape available.

The trade this buys: on a Task whose latest session is in some other status, the
control is present and the request fails with `NO_SESSION`. That is a visible,
explicable error rather than a missing tab, and the spec already requires the
failure and its reason to be reported.

### D4. The prompt is a Project-owned template with a self-contained default

Stored under `storage.project(projectId)`, edited in a project-scoped settings
section, blank save restoring the default. This follows the Handoff Notes
Template and Jira Intake Template already in this repo.

The default carries the full instruction set: what a graph document is, the
required `provenance` fields, and the exact `openforge plugin command invoke`
line to call. Nothing needs installing.

Alternative rejected: **depend on the installed PR Lens agent skill**
(`npx skills add coldteadotai/pr-lens`) and send a one-line prompt. Upstream
would own the prompt, but a machine without the skill gets a confused Agent and
no diagnosable error. Making the template editable gets that benefit without the
failure mode: anyone who has the skill can shorten their own template to invoke
it.

### D5. The Agent returns the document through a backend command

Registered with `agent` metadata so `openforge plugin command list` surfaces it
inside an Implementation Run. Backend rather than frontend because backend
commands are available whenever the backend runtime is active, while frontend
command invocations are transient and require a live renderer with the Task's
plugin frontend loaded. The Agent may be working while the user is elsewhere in
the app.

The handler runs `safeParseGraphDoc` and returns `formatIssues` output on
failure. That parse already enforces referential integrity, so a separate
`graphIntegrityIssues` call after a successful parse would always return an
empty list so the Agent gets specific, actionable
rejections rather than "invalid". On success it writes to
`storage.task(taskId)` and emits a plugin event.

Alternative rejected: **the Agent writes a file into the worktree** and the
plugin reads it. It pollutes the repository, needs cleanup, and loses the
validation round trip.

### D6. Store the document, render on every paint

`storage.task(taskId)` holds the graph document plus the plugin's own stamp. The
SVG is never stored.

The renderer is deterministic and pure, so re-rendering is free and a renderer
upgrade redraws every diagram ever stored without regenerating any of them. This
mirrors the reasoning already recorded for the Spend Index in `CONTEXT.md`:
store the raw record, compute the presentation, so a correction applies to all
of history at once.

Storage is JSON-only, which the document already is. An SVG string would fit but
would be dead weight the moment the renderer improves.

### D7. Provenance comes from the document; the plugin adds only what the schema lacks

`GraphDoc.provenance.head.sha`, `base.sha`, and `repo` are required by the
schema, so a validated document always carries them and the plugin does not
invent a commit stamp.

The plugin stores alongside it:

- `sessionId`, the newest `listSessions` row at write time. Plugin-authoritative,
  and the Agent cannot supply it.
- `storedAt`, the plugin's own clock, because `GraphDoc.generatedAt` is optional
  and Agent-supplied.
- `cleanliness`, as the Agent reported it, because the schema has no slot for
  whether the tree was dirty. Absent means unknown, never clean.

Staleness is derived from `sessionId`, not from comparing commits. Comparing
would need the worktree's current HEAD, and there is no cheap way to read it:
`shell` cannot capture command output, and reaching HEAD through
`fs.external` means resolving the worktree `gitdir` indirection and a
`packed-refs` fallback by hand. Session identity answers the question that
actually matters, "has the Agent done more since", and costs one call the tab
already makes for D3.

### D8. The renderer runs in the frontend

`render` is synchronous and pure, so calling it during paint needs no RPC and no
caching layer. The frontend reads storage directly rather than through
`backend.invoke`; the backend writes and emits, the frontend reads and repaints.

The frontend re-validates with `safeParseGraphDoc` before rendering. A document
written under an older schema version survives a plugin upgrade in storage, and
that is the path to the spec's unrenderable-document error state.
`PrLensRenderError` covers the rest.

### D9. PR Lens packages are ordinary dependencies, not catalog entries

The catalog in `pnpm-workspace.yaml` pins the shared build toolchain so every
plugin compiles identically. `@coldtea/pr-lens-schema` and
`@coldtea/pr-lens-renderer` are runtime dependencies of one plugin. The renderer
pins its schema to an exact `0.2.1`, so the two must move together and this
plugin pins both.

### D10. The tab is registered once and states its own unavailability

`taskUI.registerTab` has no per-Task predicate. A registration is global to the
plugin's frontend activation and applies to every Task, so "hidden when the Task
has no Agent Session" cannot be expressed as a property of the registration.

Driving register/dispose from `context.onDidChange` was tried and does not work:
the host publishes a plugin context change only when the active Project changes,
never when the selected Task changes. Tab visibility then freezes on whichever
Task was current at the last sync, and the first task-invalidation event that
arrives while a session-less Task is selected disposes the tab for every Task
until the app is restarted.

The plugin therefore registers the tab once and gates the request control inside
the pane, which does receive the Task's id as a prop on every render. The cost
is a PR Lens tab on Tasks that never ran, where it says so.

Reversing this needs a host change: a context change published on Task selection
(or a per-Task predicate on the registration) would make a hidden tab
expressible again.

## Risks / Trade-offs

- **Agent-authored content reaches the DOM as SVG.** The renderer emits markup
  the tab must inject. → The document is schema-validated and integrity-checked
  before storage and re-validated before render, and the renderer builds markup
  from validated fields rather than passing text through. Treat the renderer's
  "no JavaScript in output" property as load-bearing and pin its version.

- **A dead click on an unusual session status** (D3's accepted trade). → The
  failure is surfaced with its reason, and the tab keeps showing any existing
  diagram.

- **`sendFollowUp` can resume a session the user thought was finished**, which
  starts a provider process they did not ask for. → The tab reports the
  disposition it got back, so a resume is visible rather than silent.

- **The prompt lands in the Agent's terminal and consumes its context.** A long
  default template is a real cost on every request. → Keep the default tight and
  let a Project shorten it, which is exactly what D4 enables.

- **Upstream schema churn.** PR Lens is at 0.2.x, so a breaking document change
  is plausible. → Documents are stored, not rendered SVG, so a schema bump is a
  read-time migration on plugin-owned data rather than a regeneration campaign.
  D8's re-validation turns an incompatible stored document into a visible error.

- **A tab on every Task** (D10). Tasks that never ran carry a PR Lens tab that
  can only explain itself. → Accepted: the alternative depends on a Task-selection
  signal the host does not publish, and its failure mode is the tab vanishing
  from the Tasks that do have a diagram.

- **A valid document can still be a bad diagram.** Validation catches shape, not
  usefulness. → Out of the plugin's reach; the template is where diagram quality
  is tuned, and it is editable for that reason.

## Migration Plan

New plugin, no existing data or behaviour to migrate. Deployment is this repo's
standard cycle from `AGENTS.md`: test and typecheck, build, then
`openforge plugin install --path plugins/pr-lens` before the first
`openforge plugin reload`, because the manifest is new.

Rollback is disabling or uninstalling the plugin. Stored documents live in
task-scoped plugin storage and are removed with their Task.

## Open Questions

- The default template's exact wording will be tuned against real Agent runs
  across providers. The contract it must hold is fixed (self-contained, names
  the required `provenance` fields, names the exact invoke line); the prose is
  not, and changing it later changes no spec, decision, or task.
