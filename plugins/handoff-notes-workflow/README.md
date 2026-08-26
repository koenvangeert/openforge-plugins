# Handoff Notes Workflow

An optional trusted OpenForge plugin that stores agent-maintained Handoff Notes in task-scoped plugin storage. Handoff Notes are not part of the core Task record and are never written to the removed `Task.summary` field.

## Project settings

Open the **Handoff Notes Workflow** settings section for a project to:

- edit and validate the Markdown Handoff Notes template; or
- reset and immediately persist the default template.

Enabling the plugin for a project automatically persists an enabled `handoff-notes-workflow` start-prompt contribution. Missing or empty contributions are repaired with the default template, while valid custom templates are preserved. Saving a blank template also restores the default; reserved workflow tags and contributions above the host's 16,000-character limit are rejected.

## Update cadence

The workflow uses a handoff as its cadence unit. A handoff occurs when the agent returns control while implementation work remains unfinished. Opening a pull request and returning control while CI runs is one example. The agent updates Handoff Notes at each handoff and once more after final completion, before its final response.

Commands, file edits, test runs, commits, and internal work stay grouped within the current handoff. The next update waits until the agent returns control or finishes the task. Each update replaces all previous Handoff Notes with a complete brief that retains useful context and revises stale status.

## Agent CLI commands

The plugin exposes two agent-enabled backend commands:

```bash
openforge plugin command invoke \
  --command-id com.openforge.handoff-notes-workflow.get-handoff-notes

openforge plugin command invoke \
  --command-id com.openforge.handoff-notes-workflow.update-handoff-notes \
  --input '{"notes":"<complete Markdown Handoff Notes>"}'
```

Inside an Implementation Run, OpenForge supplies Task context from `OPENFORGE_TASK_ID`. The agent reads existing notes before replacing them so useful earlier context can be retained. These commands are hidden from user-facing command discovery.

## Read-only Task views

Handoff Notes appear in the Task information sidebar and in the **Handoff Notes** Task tab. Both views render the stored Markdown without an editor, save controls, template actions, validation status, or a manual refresh action. A successful agent CLI update emits a plugin event so open views update automatically.

## Local development

The SDK is linked from the sibling OpenForge checkout, so build it first (see the
repo [README](../../README.md)):

```bash
pnpm run setup            # builds ../openforge SDK, then installs this workspace
pnpm -C plugins/handoff-notes-workflow run test
pnpm -C plugins/handoff-notes-workflow run typecheck
pnpm -C plugins/handoff-notes-workflow run build
```

The build writes the installable frontend and backend entry points to `dist/frontend.js` and `dist/backend.js`, plus the stylesheet at `dist/plugin-handoff-notes-workflow.css`. OpenForge installs built artifacts and does not compile plugin source during installation.

To run every plugin's checks from the repository root:

```bash
pnpm run test && pnpm run typecheck && pnpm run build
```

## Install into OpenForge

Build the plugin first, then install it from its package directory:

```bash
pnpm run build
openforge plugin install --path "$PWD"
```

Installation is app-wide, but enablement is project-specific:

```bash
openforge project list
openforge plugin enable \
  --plugin-id com.openforge.handoff-notes-workflow \
  --project-id <PROJECT_ID>
```

After rebuilding an installed local copy, reload its artifacts:

```bash
openforge plugin reload \
  --plugin-id com.openforge.handoff-notes-workflow \
  --project-id <PROJECT_ID>
```
