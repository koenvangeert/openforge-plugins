## Why

The injectable picker offers skills as if every agent can use them. Skills live in
provider folders, and plugin or builtin items belong to one agent. A person can
insert a skill in the create-task dialog, then change the AI provider, and the
prompt still holds a name the new agent cannot resolve.

## What Changes

- The **insert dialog** (create-task, backlog prompt, and task session) lists every
  local skill on the machine and shows its folder (`.agents`, `.claude`, `.grok`,
  `.codex`, `.pi`, `.opencode`).
- Skills the **current provider** cannot use stay visible, look disabled, and are
  preview-only. Insert is off, with a short reason such as “Won’t work with Claude —
  lives in `.grok`”.
- Snippets stay usable on every provider.
- Plugin and builtin items stay tied to the **current** provider. The dialog does
  not invent another provider’s plugin list.
- If the user inserts a usable skill, then changes provider in the create-task
  dialog, the prompt stays. A warning lists skills that the new provider cannot
  use, with a Remove action. The app does not delete prompt text on its own.
- The **Injectables project panel** is a library, not an insert surface. It has no
  session. It uses the providers that OpenForge supports **and** that this
  instance can actually start a task with. Each local skill shows its folder and
  which of those installed providers can use it. A skill no installed provider can
  use stays visible and dimmed, so the user can still see how their folders are
  organised.
- Lists group like Grok’s Skills tab: **Project**, **User**, then **one group per
  plugin** (`Plugin: frontend-design`, `Plugin: mattpocock-skills`, …) with that
  plugin’s skills nested inside. Do not dump every plugin skill into a single
  “Plugin” bucket.

Out of scope for this change:

- Hiding or removing the Injectables project panel.
- Changing how snippets are created or edited.
- Pasting skill bodies into the prompt instead of `/name`.
- Making Claude read `.grok` or `.agents`, or making other agents scan new folders.
  Compatibility stays what each agent already does.

## Capabilities

### New Capabilities

- `injectable-provider-awareness`: showing local skills with their folder, grouping
  plugin skills under each plugin name, marking which skills the current or
  installed providers can use, blocking insert of unusable skills, and warning
  when a create-task provider change makes an already inserted skill invalid.

### Modified Capabilities

None. This repository has no existing injectables spec.

## Impact

- **Plugin**: `plugins/injectables` (`com.openforge.injectables`) frontend catalog,
  picker, injection trigger, and rail view. Tests for catalog filtering, folder
  display, disabled insert, and the provider-change warning.
- **Host / SDK**: the picker needs the **current** provider at each insert point,
  the panel needs the list of **installed** OpenForge providers, and plugin rows
  need the **plugin name** (today `CommandInfo` only has origin `plugin`). Local
  skills must be listed from disk; `listCatalog` is one project-default provider
  and cannot show every folder. Those SDK fields still do not exist
  (`PluginInjectionPointProps` has no provider or prompt;
  `TaskStartPrefixContext` has no provider). That work belongs in the OpenForge
  checkout, then a plugin-sdk version bump. The plugin still MUST NOT import
  app internals.
- **Reload**: after build, reinstall if the manifest `requires` list grows, then
  reload `com.openforge.injectables` for the active project.
