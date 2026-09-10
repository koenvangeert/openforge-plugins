import type { PluginStorage } from '@openforge-app/plugin-sdk'
import { SAVE_DIAGRAM_COMMAND_ID } from './prLensCommands'

export const TEMPLATE_STORAGE_KEY = 'prompt-template'

export const DEFAULT_PROMPT_TEMPLATE = `Draw the change on this task as a PR Lens diagram.

1. Read your own diff against the base branch. Work out what moved
   structurally: which components, stores, routes and services were added,
   modified or removed, and how they connect.

2. Write a PR Lens graph document describing it.

   Required: \`schemaVersion\`, \`kind: "graph"\`, \`title\`, \`lenses\`,
   \`lanes\`, \`nodes\`, and \`provenance\` with \`repo.owner\`,
   \`repo.name\`, \`base.sha\` and \`head.sha\`. Every \`edge.from\` and
   \`edge.to\` must name a node you declared.

   Every lens you declare is a promise that this document carries what that
   lens draws. Declare "architecture" for the structure. Declare "data-flow"
   only when the change has an ordered sequence worth its own diagram, and then
   also write \`flows\`: each flow needs an \`id\`, a \`title\`, at least two
   \`participants\`, each one a \`node\` naming a node you declared, and
   \`messages\` in the order they happen, each with an \`id\`, \`from\`,
   \`to\`, \`label\` and \`delta\`.

   The diagram is clickable, so fill the optional prose too. On every node give
   a \`subtitle\` (its file or module), a one-sentence \`summary\` of what
   changed in it, and \`files\` with the paths and line ranges a reader should
   open. On every edge give a \`summary\` saying what actually crosses it.
   A node with no summary reads as an empty panel when it is clicked.

   If the change is large enough that the whole graph is hard to take in,
   declare \`views\`: a tree of named drill-downs, each with an \`id\`,
   \`title\`, \`lens\` and a \`scope\`, which is either \`{"kind": "all"}\` or
   \`{"kind": "selection"}\` listing the \`lanes\`, \`nodes\`, \`edges\` or
   \`flows\` it covers. The reader can then open one part at a time. A
   "data-flow" view narrowed to a \`selection\` has to list the \`flows\` it
   draws.

3. Store it:

   openforge plugin command invoke --command-id ${SAVE_DIAGRAM_COMMAND_ID} \\
     --task-id <this task's id> \\
     --input '{"document": <graph document>, "cleanliness": "clean"}'

   Set \`cleanliness\` to "dirty" when the working tree has uncommitted changes
   the diagram covers, and omit it if you did not check. Omitting it is
   reported as unknown, never as clean.

If the command rejects the document, fix exactly what it names and call it
again. Do not ask me to edit anything.`

export async function loadPromptTemplate(
  storage: PluginStorage,
  projectId: string,
): Promise<string> {
  const stored = await storage.project(projectId).get<string>(TEMPLATE_STORAGE_KEY)
  return typeof stored === 'string' && stored.trim() ? stored : DEFAULT_PROMPT_TEMPLATE
}

export async function savePromptTemplate(
  storage: PluginStorage,
  projectId: string,
  template: string,
): Promise<string> {
  if (!template.trim()) {
    await storage.project(projectId).delete(TEMPLATE_STORAGE_KEY)
    return DEFAULT_PROMPT_TEMPLATE
  }
  const normalized = template.trim()
  await storage.project(projectId).set(TEMPLATE_STORAGE_KEY, normalized)
  return normalized
}
