# PR Lens

A trusted OpenForge plugin that shows an architecture diagram of what a Task
changed. The diagram comes from a [PR Lens](https://prlens.dev/) graph document
written by the Task's own Agent, so the plugin needs no API key, no LLM of its
own, and no pull request.

The document is stored per Task; the SVG never is. `@coldtea/pr-lens-renderer`
draws it on every paint, offline and deterministically, so an improved renderer
redraws every document already stored.

## The round trip

1. Open the **PR Lens** tab on a Task and press **Generate diagram**. The button
   only appears on Tasks that have an Agent Session, so there is always somewhere
   for the prompt to go.
2. The plugin sends the project's prompt into that Task's Agent Session with
   `tasks.sendFollowUp`, and reports whether it was delivered or queued behind
   the Agent's current work.
3. The Agent reads its own diff, writes a graph document, and returns it by
   invoking:

   ```bash
   openforge plugin command invoke --command-id dev.kvg.pr-lens.save-diagram \
     --input '{"document": <graph document>, "cleanliness": "clean"}'
   ```

4. The command validates the document against `@coldtea/pr-lens-schema` and
   stores it. A rejected document is reported back with its specific validation
   failures so the Agent can correct and retry, and the Task's previous document
   is left alone. The open tab repaints itself when a document lands.

## Editing the prompt

**Settings → PR Lens** is project-scoped. The default prompt is self-contained
and needs nothing installed beyond OpenForge and this plugin. If you have the
upstream PR Lens agent skill on the machine, shorten your project's prompt to
invoke that instead. Saving the prompt blank restores the default, and editing
one project's prompt never touches another's.

## Provenance

Every stored diagram shows the repository and head commit its document declares,
when the plugin stored it, and whether the Agent reported uncommitted changes.
Cleanliness the Agent did not report shows as unknown, never as clean.

A diagram produced by an Agent Session that is no longer the Task's current one
is marked stale. Stale diagrams stay readable and regenerable.

## Development

```bash
npm test && npm run typecheck
npm run build
```
