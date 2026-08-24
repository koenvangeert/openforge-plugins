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
`/vite`). The only OpenForge code a plugin may import. Consumed here via a local
**SDK Link**, not a published package.
_Avoid_: OpenForge app internals, renderer stores, Electron/preload, Rust internals.

**SDK Link**:
The per-plugin `link:` dependency pointing at the SDK inside the **OpenForge
Checkout**. A live symlink: a rebuilt SDK is picked up without reinstalling.
_Avoid_: vendored SDK copy, npm/registry dependency (neither exists today —
see `docs/adr/0001`).

**Catalog**:
The pnpm catalog in `pnpm-workspace.yaml` that pins the shared build toolchain
(svelte, vite, vitest, typescript, …) so every plugin builds against one identical
toolchain. The **SDK** is deliberately excluded from it.
_Avoid_: per-plugin version drift; putting the SDK link in the catalog (pnpm
rejects `link:` there).

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

## Example dialogue

> **Developer:** I found `PROJ-123` in Jira. Can I bring it into OpenForge?
>
> **Product expert:** Start **Issue Intake** for that **Jira Issue**. OpenForge
> will create a new **Task**, record an **Issue Link** to `PROJ-123`, and can
> start an **Implementation Run** after you confirm. The agent can use **Agent
> Jira Access** to retrieve current details from the Issue Key.
