# Context: openforge-plugins

The ubiquitous language for **this repository**. This is a glossary, not a spec —
no implementation details belong here.

The domain of OpenForge itself (Task, Project, Implementation Run, Trusted Plugin,
Capability, Terminal Runtime, …) is owned upstream by
`../openforge/CONTEXT.md`. That file is the source of truth for product language;
the entries below cover only terms specific to authoring plugins in this monorepo.

## Glossary

**Plugin**:
A single OpenForge Trusted Plugin authored in this repo, living as one package
under `plugins/`. Synonymous with OpenForge's **Trusted Plugin** — a trusted app
extension declared in `package.json#openforge`, not a sandboxed third-party widget.
_Avoid_: extension, add-on, Claude Code plugin (a different, unrelated plugin
system), marketplace package.

**Plugin Id**:
The app-wide-unique identifier in `package.json#openforge.id`. Plugins in this repo
use the `dev.kvg.*` reverse-DNS namespace. Distinct from the npm **Package Name**
(`@kvg/openforge-<name>`) and from the host-qualified contribution ids the runtime
derives from it.
_Avoid_: using core's `com.openforge.*` namespace; conflating id with package name.

**OpenForge Checkout**:
The sibling clone of the OpenForge product repo (expected at `../openforge`) that
provides the **SDK** this repo builds against. A required local dependency, not a
runtime dependency of the shipped plugins.
_Avoid_: "the OpenForge install", "the app" — the running desktop app is a
different thing from the source checkout.

**SDK**:
`@openforge-app/plugin-sdk` and its subpaths (`/frontend`, `/backend`, `/testing`,
`/vite`). The only OpenForge code a plugin may import. Published to npm, and
reachable two ways in this repo: by version from the registry, or through an
**SDK Link** into the **OpenForge Checkout**. A plugin uses one or the other,
never both.
_Avoid_: OpenForge app internals, renderer stores, Electron/preload, Rust internals.

**SDK Link**:
The per-plugin `link:` dependency pointing at the SDK inside the **OpenForge
Checkout**. A live symlink: a rebuilt SDK is picked up without reinstalling, which
is what makes it worth keeping while co-developing the SDK and a plugin together.
Its cost is that the plugin cannot be built without the Checkout present and
built. Every plugin authored before the SDK was published to npm still uses one.
_Avoid_: vendored SDK copy; describing a registry dependency as unavailable (the
SDK is published); mixing a Link and a registry version in one plugin.

**Catalog**:
The pnpm catalog in `pnpm-workspace.yaml` that pins the shared build toolchain
(svelte, vite, vitest, typescript, …) so every plugin builds against one identical
toolchain. The **SDK** is deliberately excluded from it.
_Avoid_: per-plugin version drift; putting an **SDK Link** in the catalog (pnpm
rejects `link:` there, which is the only reason the SDK sits outside it; a
registry version of the SDK could live in the catalog).

**Frontend Entry / Backend Entry**:
The two independent built artifacts a plugin may ship (`dist/frontend.js`,
`dist/backend.js`), each registered through `defineFrontendPlugin` /
`defineBackendPlugin`. A plugin may ship either or both.
_Avoid_: "the bundle" (there can be two); mixing renderer-only and backend-only
registries across the boundary.

**Local-Path Install**:
The way a built plugin from this repo is loaded into a running OpenForge app —
pointing the app's plugin manager at the plugin directory's absolute path. Install
is app-wide; enablement is per project.
_Avoid_: "publish", "deploy" — there is no registry or marketplace step.

## Jira plugin

Domain language owned by the Jira plugin (`dev.kvg.jira`). A **Plugin-owned
Domain** in OpenForge terms: these concepts belong to the plugin, not to
OpenForge core. OpenForge's **Task** stays the unit of work; the terms below name
the *external* tracker entity it can be linked to.

**Jira Issue**:
The external Atlassian work item (Issue Key, summary, status, assignee, type, …)
that an OpenForge **Task** may be linked to. A Task is OpenForge's unit of work; a
Jira Issue lives in Jira. The two are linked, never merged.
_Avoid_: calling an OpenForge Task an "issue" or "ticket"; "card", "story" (a
story is one issue type, not the category).

**Jira Authority**:
Jira is the only place where **Jira Issues** are created, changed, transitioned,
or deleted. The Jira Plugin reads and opens Issues but never writes them.
_Avoid_: write-back, two-way sync, inline Jira editing, Jira mutations.

**Jira Connection**:
The globally configured Jira site and user identity shared by the Jira Plugin
across OpenForge **Projects**. Project-specific work discovery belongs to each
Project's **Intake Query**, not to separate Jira credentials.
_Avoid_: per-Project Jira account, per-query credentials.

**Issue Key**:
The human-readable Jira identifier such as `PROJ-123`. It can look identical to an
OpenForge **Task id** (e.g. `KVG-1219`) but the two id systems are independent —
coincidental shape is not identity.
_Avoid_: conflating with the **Task id**; "issue number", "ticket id".

**Issue Link**:
The stored association from one OpenForge **Task** to at most one **Issue Key**,
held in `storage.task(taskId)`. One **Jira Issue** may be linked to several Tasks;
the user explicitly confirms a same-project duplicate after a warning. A
key-shaped hint scanned from Task text is never authoritative.
_Avoid_: "mapping"/"sync" (nothing is written back into the Task or into Jira);
assuming a one-to-one relationship or that the Task id equals the Issue Key.

**Issue Link State**:
The active **Project**'s count of OpenForge **Tasks** linked to a **Jira Issue**,
shown as unlinked or as the number of linked Tasks. Counts Tasks in **every**
status, done included — a completed Task still holds its **Issue Link**, so it
shows in the list and counts toward the duplicate-intake guard. Active Tasks
(backlog, doing) list ahead of done ones.
_Avoid_: Jira status, synchronization state, global link count; "active Tasks
only" (the host's default `tasks.list` excludes done, but this state does not).

**Issue Snapshot**:
The Jira Plugin's stored copy of one **Jira Issue** for one OpenForge **Task**,
together with the time it was read. The **Linked Issue Section** paints the
snapshot immediately and re-reads Jira only once it falls outside a short
freshness window, so moving between Tasks does not re-read Jira every time. A
snapshot recorded for a different **Issue Key** never stands in for the linked
one, and refreshing on demand always re-reads Jira. A re-read that happens while
a snapshot is already on screen stays silent: it neither shows progress nor
reports a failure, so a stale snapshot can sit on screen with only its read time
to give it away.
_Avoid_: "sync", "mirror", "poll" (nothing is written back, and no timer keeps a
snapshot current; a re-read happens when a **Task** with a stale snapshot is
opened, or when the user refreshes); treating a snapshot as authoritative, since
**Jira Authority** still holds; one snapshot shared across Tasks (each Task
keeps its own).

**Linked Issue Section**:
The collapsible Jira Plugin section present in every OpenForge **Task**'s detail
stack. It shows compact current Jira context and a path back to Jira when linked;
otherwise it offers to create an **Issue Link**, including a confirmable
key-shaped hint when one exists.
_Avoid_: Jira tab, Task-pane tab, full Jira editor.

**Issue Intake**:
The user-initiated workflow that creates an OpenForge **Task** from a **Jira
Issue** and records its **Issue Link**. It explicitly ends with either the
created Task or, after user confirmation, a started OpenForge **Implementation
Run**; OpenForge owns both lifecycles.
_Avoid_: import, sync, Jira task, treating the Jira Issue as the OpenForge Task.

**Intake Workspace**:
The active OpenForge **Project**'s master-detail Jira Plugin surface where users
find **Jira Issues**, compare them in a table, review one Issue's context, and
begin **Issue Intake** for that Project.
_Avoid_: Jira dashboard, backlog mirror, Issue editor, cross-project intake,
target Project chooser, AI scoring, Kanban, reporting.

**Intake Query**:
The single, Project-owned JQL query that selects the **Jira Issues** shown in the
**Intake Workspace**. Each Project remembers its own query; the user edits it in a
plain JQL input field and applies it.
_Avoid_: named/saved filters, a filter picker, combined filter chips, global
filter, client-side app filter.

**Intake Context**:
The concise Jira context carried into a new OpenForge **Task** during **Issue
Intake**: the **Issue Key**, Jira summary, and Jira description. **Agent Jira
Access** supplies current or extended Issue details when needed.
_Avoid_: full Issue mirror, synchronized copy, copying every Jira field.

**Intake Template**:
The single, Project-owned text template that arranges the **Intake Context** into
the new **Task**'s initial prompt during **Issue Intake**. Each Project remembers
its own template; the user edits it in the **Intake Workspace**, and a Project
that never touches it keeps the default arrangement. Placeholders name the
Intake Context fields; the template controls layout, not which Issue fields are
available.
_Avoid_: a global/app-wide template, per-Issue templates, pulling in Jira fields
beyond the **Intake Context**, treating the template as a Jira write-back format.

**Agent Jira Access**:
The independently configured ability of an **Agent Session** to retrieve the
current **Jira Issue** using its **Issue Key**. It is available to the agent
workflow but is not supplied by the Jira Plugin or its **Issue Link**.
_Avoid_: Jira SDK, plugin backend access, assuming every agent has it configured.

## Handoff Notes plugin

Domain language owned by the Handoff Notes Workflow plugin
(`com.openforge.handoff-notes-workflow`), ported from the upstream
`koenvg/openforge-plugins` repo. A **Plugin-owned Domain**: OpenForge's **Task**
stays the unit of work; the terms below name the agent-written brief attached to
it.

**Handoff Notes**:
The single Markdown brief the agent maintains for one OpenForge **Task**, held in
task-scoped plugin storage. Every update replaces the whole brief; there is no
append and no history. Never part of the core Task record.
_Avoid_: "the task summary" (a removed Task field, not a Handoff Notes store);
notes, log, changelog, comment thread.

**Handoff**:
The cadence unit for updating **Handoff Notes**: the moment the agent returns
control while implementation work remains unfinished (opening a pull request and
waiting on CI is one). Commands, edits, test runs, and commits group inside the
current handoff; the next update waits for the next handoff or for final
completion.
_Avoid_: per-command updates, per-commit updates, timed or continuous updates.

**Handoff Notes Template**:
The Project-owned Markdown skeleton whose headings the **Handoff Notes** are
expected to fill. Each Project edits its own; a blank save
restores the default. Reserved workflow tags and templates that push the prompt
past the host's 16,000-character limit are rejected.
_Avoid_: a global template, per-Task templates, treating the template as the notes.

**Handoff Notes Contribution**:
The start-prompt contribution (`handoff-notes-workflow`) the plugin persists per
Project so an **Agent Session** receives the cadence rules, the active **Handoff
Notes Template**, and the two command invocations. Missing or empty contributions
are repaired; valid custom templates are preserved.
_Avoid_: injecting the notes themselves into the prompt; a user-editable prompt
block.

**Handoff Notes Views**:
The read-only Task tab and Task-sidebar section that render the stored **Handoff
Notes** Markdown. No editor, save control, template action, or manual refresh; an
agent update emits a plugin event so open views repaint.
_Avoid_: an editing surface, user-authored notes, a refresh button.

## Example dialogue

> **Developer:** I found `PROJ-123` in Jira. Can I bring it into OpenForge?
>
> **Product expert:** Start **Issue Intake** for that **Jira Issue**. OpenForge
> will create a new **Task**, record an **Issue Link** to `PROJ-123`, and can
> start an **Implementation Run** after you confirm. The agent can use **Agent
> Jira Access** to retrieve current details from the Issue Key.

## Claude Code Usage plugin

Domain language owned by the Claude Code Usage plugin. A **Plugin-owned Domain**:
these concepts belong to the plugin. Note that "Claude Code" here names the
Anthropic CLI that OpenForge drives as an agent provider, not OpenForge's own
unrelated plugin system.

**Spend**:
The real US-dollar amount Anthropic bills for token consumption, at API list
prices. Not notional, not an estimate of what a subscription would have cost:
this account is billed per token, so a Spend figure is money actually owed.
Always derived by applying the **Price Table** to recorded token counts, using
one formula for every session and every model so figures stay comparable across
all of history.
_Avoid_: "notional cost", "API-equivalent cost", "credits", "usage" as a synonym
for Spend (usage is tokens, Spend is dollars).

**Price Table**:
The plugin-owned mapping from model id to per-token prices, covering input,
output, and the separately-priced cache-write and cache-read rates. The single
place a price lives, and the one thing that must be updated when Anthropic
changes prices or ships a model. A model absent from the Price Table is reported
as unpriced, never silently priced at zero.
_Avoid_: hardcoding prices at call sites; treating a missing model as free;
reusing Claude Code's own internal table (it is not part of any contract the
plugin may depend on).

**Billed Response**:
One Anthropic API response, and therefore the unit Anthropic charges for.
Identified by its message id. A single Billed Response is written to a transcript
as *several* records, one per content block (thinking, text, each tool call).
Counting transcript records instead of Billed Responses roughly doubles **Spend**.
Those records do not all agree: while a response streams, its earlier records
carry a partial output count that grows monotonically, so only the *last* record
for a message id holds the response's complete usage. Collapsing to the first
record instead undercounts output by roughly a quarter.
_Avoid_: "message" or "record" as a synonym (a Billed Response spans several
records); deduplicating on a record's own identity rather than the message id;
assuming the records for one message id are interchangeable.

**Cost State**:
Claude Code's own cost total, written into a transcript as a `cost-state` record.
Covers only the single Claude Code *process* that wrote it, from its `startTime`
onward: resuming a session restarts the total while continuing to append to the
same transcript, so one transcript can hold a week of work and a Cost State
describing only its last hour. It is therefore neither a session total nor a
transcript total, and never a display value. Its one use is as a test oracle,
and only for **Billed Responses** timestamped at or after its `startTime`.
Even inside its own window it is not reproducible: it bills responses that have
no usage record anywhere in the transcript, which is why computed **Spend** sits
a few percent below it.
_Avoid_: treating it as the cost of a session, a transcript, or a **Task**;
summing Cost States across transcripts; presenting it next to computed **Spend**;
treating a gap against it as an arithmetic error.

**Spend Dashboard**:
The plugin's single cross-project surface, contributed as a sidebar-placed view
and reached without picking a **Project** first. It is App-Enabled rather than
enabled per Project, because the whole point is one figure spanning every
Project. Its primary axis is the OpenForge **Task**, rolling up to **Project**.
_Avoid_: an icon-rail entry (the rail is the per-Project surface, and a rail
entry showing cross-project totals misstates its own scope); a settings section;
a per-Project spend tab; requiring enablement in each Project.

**Spend Attribution**:
The assignment of each **Billed Response** to an OpenForge **Task** or
**Project**, derived from the working directory Claude Code recorded for it. A
directory inside an OpenForge worktree attributes to that worktree's Task, and
therefore to the Task's Project; a directory inside a Project checkout
attributes to that Project with no Task; anything else is reported as
unattributed rather than hidden or spread across Projects. Matching is by
directory prefix, since an agent may record a path deeper inside the tree.
_Avoid_: silently dropping unattributed spend; splitting one Billed Response
across Tasks; treating the worktree's directory name as a Project id.

**Spend Index**:
The plugin's persisted rollup of token counts per recorded working directory, UTC
hour, and model, maintained by a background service so the **Spend Dashboard**
opens without rereading transcripts. Rows are grouped per transcript, so
re-reading an appended file replaces that file's rows and disturbs no others.
Rows key on the raw directory rather than a resolved scope, leaving **Spend
Attribution** to happen on read: a **Task** created today then picks up the spend
its worktree already accumulated. Rows hold tokens only, never dollars: **Spend** is
computed from the **Price Table** on every render, so correcting a price
re-prices all recorded history at once and a row can never carry a stale dollar
figure. Rows are bucketed by UTC hour rather than by day so the Dashboard can
present days in the reader's own timezone without the stored buckets depending
on which timezone aggregated them.
Because Claude Code prunes its own transcripts after roughly a month, the Spend
Index is not merely a cache of them: for any period whose transcripts have been
pruned it is the only surviving record. It therefore only ever grows by merging
newly-read files into what it already holds. Rebuilding it from the transcripts
present today would silently erase every pruned period, so a rebuild merges and
never replaces.
_Avoid_: storing computed cost in a row; storing a resolved scope in a row;
bucketing by local day; describing the index as a cache; a destructive rebuild;
assuming a period absent from the transcripts was a period without **Spend**.

**Unpriced Model**:
A model id observed in the transcripts that the **Price Table** has no entry for.
Its tokens are excluded from **Spend** and it is named on the **Spend Dashboard**
alongside its token volume, so an out-of-date Price Table shows up as a visible
gap rather than as a total that is quietly too low. The plugin has no fallback
rate: guessing a price would make a wrong number indistinguishable from a right
one.
_Avoid_: pricing an unknown model at zero, at a sibling model's rate, or at a
default; omitting it from the Dashboard.
