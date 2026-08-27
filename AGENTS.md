# OpenForge plugin development

Use only the public `@openforge-app/plugin-sdk` contract described in
`../openforge/docs/plugin-authoring.md`. Keep plugin runtime code out of
OpenForge application internals.

## Test, build, reload: every time

**A plugin change is not done until it is built and reloaded.** A source edit
alone does not change what the app runs, so handing off an unbuilt or unreloaded
change means the user tests a stale artifact and reports the bug as unfixed.
This applies to every change, including a one-line fix.

Run all four steps, in order, before reporting the change as finished:

```bash
cd plugins/<plugin>
npm test && npm run typecheck   # 1. prove the change
npm run build                   # 2. refresh package.json#openforge dist/ entries
openforge project list          # 3. find the Project id for the active worktree
openforge plugin reload --plugin-id <id> --project-id <project-id>
```

Then report the reload result. `"reloaded": true` is the only success; report any
failure explicitly instead of asking the user to test. If the plugin is not
installed or enabled, install it from its local plugin source and enable it for
the Project first.

`plugin reload` reloads built artifacts only. The host stores
`package.json#openforge` at install time, so any manifest change (a new
capability in `requires`, a new `frontendStyles` entry, a changed `enablement`)
needs `openforge plugin install --path <plugin dir>` before the reload, or the
host keeps serving the metadata it captured earlier. A declared stylesheet that
never got installed shows up as a plugin whose layout classes silently do
nothing.

Plugin ids come from each plugin's `package.json#openforge.id`:

| Plugin                           | Plugin id                              |
| -------------------------------- | -------------------------------------- |
| `plugins/claude-usage`           | `dev.kvg.claude-usage`                 |
| `plugins/handoff-notes-workflow` | `com.openforge.handoff-notes-workflow` |
| `plugins/injectables`            | `com.openforge.injectables`            |
| `plugins/issues`                 | `com.openforge.issues`                 |
| `plugins/jira`                   | `dev.kvg.jira`                         |

Use the installed `openforge` launcher for plugin management; do not call app
internals or the launcher's underlying scripts directly.
