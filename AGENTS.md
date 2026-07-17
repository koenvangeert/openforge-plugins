# OpenForge plugin development

Use only the public `@openforge-app/plugin-sdk` contract described in
`../openforge/docs/plugin-authoring.md`. Keep plugin runtime code out of
OpenForge application internals.

Before asking the user to test a finished plugin change in the running
OpenForge app:

1. Run the affected plugin's tests and typecheck.
2. Build the plugin so its `package.json#openforge` entry points in `dist/` are
   current.
3. Reload the installed artifacts for the active Project with
   `openforge plugin reload --plugin-id <id> --project-id <project-id>`.
4. Ask the user to test only after the reload succeeds. If the plugin is not
   installed or enabled, install it from its local plugin source and enable it
   for the Project before reloading. Report any reload failure explicitly.

Use the installed `openforge` launcher for plugin management; do not call app
internals or the launcher's underlying scripts directly.
