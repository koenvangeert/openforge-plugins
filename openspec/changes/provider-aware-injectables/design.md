## Context

See `proposal.md` for motivation and `specs/injectable-provider-awareness/spec.md`
for the behaviour contract.

The insert dialog and the project panel share `InjectableBrowser`. Insert mode
today drops `.codex`, `.pi`, and `.opencode` skills and only shows the folder
badge in manage (rail) mode. The trigger ignores `location` and `taskId`. The
public SDK injection props are `api`, `context`, `location`, `projectId`,
`taskId`, and `onInsert`. There is no current provider, no installed-provider
list, and no prompt text. The host `InjectionPointSlot` still passes only
those fields. `TaskStartPrefixContext` is `taskId` and `projectId` only.
`commands.listCatalog` takes only `projectId` and follows the **project default**
provider. It cannot list every local folder. Plugin rows have origin `plugin`
but no plugin name on `CommandInfo`.

Folder compatibility is not symmetric, and the host scan is not the agent.
Grok Build reads `.grok`, `.claude`, and `.agents`. OpenForge’s Grok
`list_commands` omits `.claude`. OpenCode the agent also reads `.claude` and
`.agents`; OpenForge’s OpenCode scan is `.opencode` only. Claude Code reads
`.claude` and does not read `.grok` or `.agents`. Codex and Pi read `.agents`
plus their own folder. That matrix belongs in one function, not in the UI.

## Goals / Non-Goals

**Goals:**

- Drive insert eligibility from (current provider + folder) for local skills, and
  from the current provider’s catalog for plugin/builtin items.
- Teach folder layout by showing every local skill, including ones that cannot be
  inserted right now.
- Use installed OpenForge providers as the panel’s universe, because the panel
  has no session.
- Extend the public SDK when the plugin cannot see provider, prompt, or plugin
  name. Do not import OpenForge app internals.
- Group plugin skills under each plugin name, matching Grok’s Skills tab.

**Non-Goals:**

- Changing what each agent scans on disk.
- A new prompt model (chips instead of `/name` text).
- Hiding the project panel.

## Decisions

### 1. One compatibility table for local folders

Local skill usability is a pure function of provider id and `sourceDir`.

| Folder     | Grok | Claude | Codex | Pi | OpenCode |
| ---------- | ---- | ------ | ----- | -- | -------- |
| `.grok`    | yes  | no     | no    | no | no       |
| `.claude`  | yes  | yes    | no    | no | yes      |
| `.agents`  | yes  | no     | yes   | yes| yes      |
| `.codex`   | no   | no     | yes   | no | no       |
| `.pi`      | no   | no     | no    | yes| no       |
| `.opencode`| no   | no     | no    | no | yes      |
| snippet    | yes  | yes    | yes   | yes| yes      |

Plugin and builtin rows are usable only when they come from the current
provider’s catalog. They have no folder that we trust as a proxy.

**Why this over “folder equals provider”:** Grok would hide `.claude` skills it
can actually run. Claude would be offered `.agents` skills it cannot run.

**Alternative considered:** hide unusable local skills. Rejected; the user wants
to see how their skills are split across folders.

### 2. Insert mode lists every local folder

`INSERT_SKILL_DIRS` becomes the full scanned set (`.agents`, `.claude`, `.grok`,
`.codex`, `.pi`, `.opencode`). Unusable rows stay in the list and are marked
disabled. The folder badge is shown in insert mode, not only in manage mode.

Disabled means: preview yes; `onActivate`, Enter, double-click, and the Insert
button no. The footer states the reason with provider + folder.

### 3. SDK must pass provider and prompt context

The plugin cannot meet the spec with today’s injection contract.

Minimum public additions (names illustrative):

- Current provider on insert points (`createTaskPrompt`, `agentSession`,
  `backlogPrompt`) and on `taskStart` prefix context. Create-task MUST update
  this when the dropdown changes, without reopening the dialog.
- Installed providers: the OpenForge-supported agents this instance can start a
  task with. The panel uses this set. “Installed” means OpenForge can start it,
  not merely that a CLI folder exists on disk.
- Create-task prompt text plus a way to remove named skill tokens, so the warning
  and Remove action can live in the plugin without scraping the DOM.
- Plugin name on catalog rows (`pluginName` or equivalent). Origin `plugin` is
  not enough to nest `Plugin: mattpocock-skills` vs `Plugin: impeccable`. Do not
  parse `plugin:command` names as a substitute; Grok plugin *skills* are not
  namespaced that way.

If those fields are missing, implementation stops at an SDK change in the
OpenForge checkout, then a plugin SDK version bump. The plugin still MUST NOT
import app internals.

**Alternative considered:** host-owned warning with the plugin only exporting
“is this token valid”. That splits the UX across two packages. Prefer one owner
(the plugin) once the host passes provider + prompt.

### 3b. Local skills come from a disk scan in the plugin

`listCatalog` is one provider (project default). To show every local skill, the
plugin backend MUST scan `.agents`, `.claude`, `.grok`, `.codex`, `.pi`, and
`.opencode` itself (user + project). `listCatalog` remains the source for
plugin/builtin items of a given provider.

**Why this over unioning host catalogs:** the host has no “all providers”
catalog today. Each provider’s OpenForge scan is incomplete relative to the
agent: Grok’s scan omits `.claude` even though Grok reads it; OpenCode’s scan
is `.opencode` only, even though OpenCode also reads `.claude` and `.agents`.

### 3c. Group list like Grok’s Skills tab

Default groups, in order: Snippets, Project, User, Builtin, then one group per
plugin named `Plugin: <plugin name>`, skills nested inside, collapsible. Drop
the single shared “Plugin” origin bucket when grouping by origin.

**Alternative considered:** keep one Plugin section and badge the plugin name
on the row. Rejected; the requested layout is nested groups.

### 4. Project panel is a library over installed providers

No current provider, so no insert-time gray-out against one agent.

- Each local skill shows folder and a chip per **installed** provider that can
  use it.
- A skill no installed provider can use stays visible and dimmed.
- Plugin/builtin rows on the panel are the union of catalogs for installed
  providers only, each tagged with that provider.
- No Insert control. Existing copy of invocation text may remain for usable
  rows; it is not the create-task warning path.

**Why “supported AND installed”:** showing Pi compatibility on a machine that
cannot start Pi is noise. Showing every local file, including ones no installed
provider can run, still teaches folder layout.

### 5. Warning scans slash (and dollar) tokens already in the prompt

When create-task provider changes, compare prompt tokens to the new provider’s
usable set. Warn only for tokens that match a known local skill or a plugin item
that is now invalid. Do not warn on free text that happens to look like `/foo`
if it is not in the catalog. Remove deletes those tokens from the prompt and
leaves the rest.

## Risks / Trade-offs

- **[SDK gap]** Injection points have no provider or prompt today. → Treat the
  SDK additions as a blocking first slice. Do not fake provider from project
  default alone; create-task can differ from the project default.
- **[Stale matrix]** An agent may start reading a new folder. → Keep the table in
  one module with tests per provider. Wrong cells are product bugs, not UI bugs.
- **[Codex `$name` vs `/name`]** Inserting `/name` into a Codex prompt may still
  fail even when the skill is usable. → This change still inserts the catalog’s
  `invocationText`. A Codex invocation-prefix fix is out of scope unless it is
  already in `invocationText`.
- **[Catalog completeness]** `listCatalog` follows the project default
  provider’s OpenForge scan, not the agent’s real folders. Claude’s scan
  already walks every local skill dir (including `.grok`); Grok’s scan omits
  `.claude`; OpenCode’s scan omits `.claude` and `.agents`. → Scan local
  folders in the plugin. Keep `listCatalog` for plugin/builtin of the current
  (or installed) provider only.
- **[No plugin name]** `CommandInfo` has no plugin id/name. → Add it in the SDK
  and have each provider’s `list_commands` fill it. Until then, nested plugin
  groups cannot be built honestly.

## Migration Plan

1. In the **OpenForge checkout** (not this plugins repo): add the SDK fields
   and host wiring, then publish or link a plugin-sdk version the plugin can
   depend on.
2. In **`plugins/injectables`**: teach the compatibility table, disabled rows,
   folder badge in insert mode, panel chips, and create-task warning.
3. Build, typecheck, test, then `plugin install` if `requires` changes, then
   `plugin reload`.
4. Rollback is a plugin reload of the previous artifact; no stored data format
   changes.

## Open Questions

None that block the spec. Visual density of provider chips on the panel can be
tuned during implementation without changing requirements.
