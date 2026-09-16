## Purpose

Lets a person browse every local skill they own, see which folder it lives in, and
insert only the skills the current (or installed) OpenForge provider can actually
resolve, with a warning if they change provider after insert.

## ADDED Requirements

### Requirement: Insert dialog lists local skills with folder

When the injectable insert dialog opens, it MUST list every local skill found on
this machine for the project (personal and project skills in `.agents`, `.claude`,
`.grok`, `.codex`, `.pi`, and `.opencode`). Each local skill row MUST show the
folder it lives in. Snippets MUST appear in the same dialog and remain insertable
for every provider.

#### Scenario: Folder is visible on a local skill

- **WHEN** the user opens the insert dialog
- **THEN** each local skill row shows its folder (for example `.grok` or `.agents`)
- **AND** snippets are listed and can be inserted

#### Scenario: Skills from unused folders still appear

- **WHEN** the current provider is Claude and the user has a skill only in `.grok`
- **THEN** that skill still appears in the list
- **AND** its folder is shown as `.grok`

### Requirement: Unusable local skills are preview-only

A local skill the current provider cannot resolve MUST stay visible and MUST look
disabled. The user MUST be able to open its preview. Insert (button, Enter, and
double-click) MUST be disabled. The dialog MUST state why, including the current
provider and the folder, for example “Won’t work with Claude — lives in `.grok`”.

Plugin and builtin items MUST appear only for the current provider. The dialog
MUST NOT list another provider’s plugin or builtin catalog.

#### Scenario: Gray skill cannot be inserted

- **WHEN** the current provider cannot resolve a listed local skill
- **THEN** the row looks disabled
- **AND** the user can still open the preview
- **AND** Insert, Enter, and double-click do not insert it
- **AND** the dialog explains that the current provider cannot use that folder

#### Scenario: Plugin items follow the current provider

- **WHEN** the current provider is Grok
- **THEN** the dialog lists Grok plugin and builtin items that Grok can use
- **AND** it does not list Claude plugin or builtin items

### Requirement: Provider change after insert warns and does not delete

If the user inserts a usable skill into the create-task prompt and then changes
the AI provider, the prompt text MUST stay. The create-task surface MUST warn
when the prompt still contains a skill the new provider cannot resolve. The
warning MUST offer a Remove action for those skills. The app MUST NOT delete
prompt text unless the user takes that action.

#### Scenario: Switch provider after insert

- **WHEN** the user inserts a Grok-only skill while the create-task provider is Grok
- **AND** then changes the provider to Claude
- **THEN** the prompt still contains the inserted skill text
- **AND** a warning says the skill will not work with Claude
- **AND** the warning offers Remove

#### Scenario: User keeps the text

- **WHEN** the warning is visible
- **AND** the user does not choose Remove
- **THEN** the prompt is unchanged

### Requirement: Project panel uses installed OpenForge providers

The Injectables project panel is a library. It is not tied to one running session.
It MUST use the set of AI providers that OpenForge supports and that this OpenForge
instance can start a task with (“installed providers”).

Each local skill on the panel MUST show its folder and which installed providers
can use it. A local skill that no installed provider can use MUST stay visible and
look dimmed. Snippets MUST appear and are usable for every provider. The panel
MUST NOT insert into a prompt.

Plugin and builtin items on the panel MUST be limited to installed providers. The
panel MUST NOT show plugin or builtin items for a provider this instance cannot
start.

#### Scenario: Panel shows compatibility without a session

- **WHEN** the user opens the Injectables project panel
- **AND** this OpenForge instance can start Grok and Claude but not Pi
- **THEN** each local skill shows its folder
- **AND** each local skill shows which of Grok and Claude can use it
- **AND** a skill that only Pi can use stays visible and looks dimmed
- **AND** the panel does not offer Insert into a prompt

#### Scenario: Panel hides plugins from providers that are not installed

- **WHEN** Codex is not installed on this OpenForge instance
- **THEN** the panel does not list Codex plugin or builtin items

### Requirement: Plugin skills nest under their plugin

The insert dialog and the project panel MUST group plugin skills by plugin name,
one collapsible group per plugin (for example `Plugin: mattpocock-skills`), with
that plugin’s skills nested inside. They MUST NOT put every plugin skill in a
single shared “Plugin” group.

Local skills MUST stay in Project and User groups. Snippets MUST stay in their
own group. Builtin items MUST stay in a Builtin group, not mixed into a plugin
group.

#### Scenario: Two plugins do not share a group

- **WHEN** the current provider has skills from plugin `frontend-design` and
  plugin `mattpocock-skills`
- **THEN** the list shows a group `Plugin: frontend-design`
- **AND** a separate group `Plugin: mattpocock-skills`
- **AND** each skill appears only under its own plugin

#### Scenario: Project and user skills stay outside plugin groups

- **WHEN** the list includes a project skill, a user skill, and a plugin skill
- **THEN** the project skill is under Project
- **AND** the user skill is under User
- **AND** the plugin skill is under `Plugin: <plugin name>`
