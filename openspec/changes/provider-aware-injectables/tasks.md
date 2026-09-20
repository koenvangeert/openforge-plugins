## 1. SDK contract (OpenForge checkout)

These tasks land in the OpenForge app repo (`packages/plugin-sdk` plus the host
injection-point, catalog, and create-task surfaces). They do not land in this
plugins repository. Apply them first; the injectables plugin cannot meet the
spec without the new public fields.

- [ ] 1.1 Add current provider to injection-point and task-start prefix context in the public plugin SDK, and verify a type-level or SDK test shows `createTaskPrompt` updates that provider when the create-task dropdown changes
- [ ] 1.2 Add an installed-providers API (OpenForge-supported agents this instance can start) and verify a test returns only startable providers, not every folder on disk
- [ ] 1.3 Add create-task prompt text plus a Remove/replace path for skill tokens on the `createTaskPrompt` injection point, and verify a test can read the prompt and remove a named token without touching the rest
- [ ] 1.4 Add plugin name on catalog rows (`CommandInfo` / injectable view model), and verify a test keeps two skills from different plugins as distinct plugin groups rather than one “Plugin” bucket
- [x] 1.5 Publish or link that SDK version into `plugins/injectables` and verify `npm run typecheck` in the plugin sees the new fields

## 2. Folder compatibility (`plugins/injectables`)

- [x] 2.1 Encode the local-folder × provider matrix from design.md in one module, and verify unit tests cover Grok reading `.claude` and `.agents`, Claude reading only `.claude`, Codex/Pi reading `.agents`, and OpenCode reading `.opencode`, `.claude`, and `.agents`
- [x] 2.2 Treat snippets as usable for every provider, and verify a test asserts a snippet is never disabled
- [x] 2.3 Treat plugin and builtin items as usable only when they come from the current provider’s catalog, and verify a test does not use `sourceDir` as a proxy for those rows

## 3. Local disk catalog (`plugins/injectables`)

- [x] 3.1 Scan user and project skill folders (`.agents`, `.claude`, `.grok`, `.codex`, `.pi`, `.opencode`) in the injectables backend, including `.grok`, and verify a test lists a `~/.grok/skills` skill even when `listCatalog` returns only Claude items
- [x] 3.2 Merge that disk scan with snippets and with `listCatalog` plugin/builtin rows, and verify a test does not drop a disk skill just because the project default provider is Claude

## 4. Insert dialog (`plugins/injectables`)

- [ ] 4.1 List every local skill folder in insert mode (`.agents`, `.claude`, `.grok`, `.codex`, `.pi`, `.opencode`) and verify a test that previously dropped `.codex`/`.pi`/`.opencode` now keeps them
- [ ] 4.2 Show the folder badge on each local skill row in the insert dialog, and verify a picker test finds `.grok` (or equivalent) on the row
- [ ] 4.3 Disable Insert, Enter, and double-click for a local skill the current provider cannot use, keep preview, and verify a picker test asserts the reason names the provider and folder
- [ ] 4.4 Limit plugin and builtin rows to the current provider, and verify a test with provider Grok does not list a Claude builtin/plugin item
- [ ] 4.5 Pass the current provider from `InjectionTrigger` into the picker, and verify the disabled set updates when that provider prop changes without remounting the dialog
- [ ] 4.6 Group the list as Snippets, Project, User, Builtin, then `Plugin: <name>` per plugin, and verify a picker test shows `frontend-design` and `mattpocock-skills` as two groups with nested skills

## 5. Create-task warning (`plugins/injectables`)

- [ ] 5.1 When the create-task provider changes, warn if the prompt still contains a catalog skill the new provider cannot use, and verify a test keeps the prompt text and shows the warning
- [ ] 5.2 Offer Remove on that warning to delete only those skill tokens, and verify a test leaves the rest of the prompt intact when the user does not choose Remove and strips only the invalid tokens when they do

## 6. Project panel (`plugins/injectables`)

- [ ] 6.1 Show each local skill’s folder and a chip per installed provider that can use it, and verify a view test with Grok+Claude installed labels a `.agents` skill as Grok-only (not Claude)
- [ ] 6.2 Dim a local skill that no installed provider can use, keep it visible, and verify a test with Pi absent dims a `.pi`-only skill
- [ ] 6.3 Limit panel plugin/builtin rows to installed providers, and verify a test with Codex not installed lists no Codex plugin/builtin items
- [ ] 6.4 Keep the panel free of Insert-into-prompt, and verify the view still has no insert activation path
- [ ] 6.5 Use the same per-plugin nested groups on the panel, and verify a view test shows two plugin names as two groups

## 7. Build and reload (`plugins/injectables`)

- [x] 7.1 Run `npm test && npm run typecheck && npm run build` in `plugins/injectables` and verify all three succeed
- [x] 7.2 If `package.json#openforge` `requires` changed, `openforge plugin install --path plugins/injectables`; then reload `com.openforge.injectables` for the active project and verify `"reloaded": true`
