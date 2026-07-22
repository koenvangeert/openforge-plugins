import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Snippet } from '../lib/injectableDomain'

export interface SnippetInput {
  name: string
  body: string
  allProjects: boolean
  projectIds: string[]
}

/** Personal snippets persist to `<homedir>/.openforge/injectables/snippets.json` (or
 * `$OPENFORGE_INJECTABLES_DIR/snippets.json` when that env var is set), as a JSON array of {@link Snippet}. */
export function snippetsFilePath(): string {
  const override = process.env.OPENFORGE_INJECTABLES_DIR
  if (override && override.length > 0) {
    return join(override, 'snippets.json')
  }
  return join(homedir(), '.openforge', 'injectables', 'snippets.json')
}

async function readAll(file: string): Promise<Snippet[]> {
  try {
    const raw = await readFile(file, 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as Snippet[]) : []
  } catch {
    return []
  }
}

async function writeAll(file: string, snippets: Snippet[]): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(snippets, null, 2))
}

export async function listSnippets(file: string): Promise<Snippet[]> {
  return readAll(file)
}

function validate(input: SnippetInput): void {
  if (!input.name.trim()) throw new Error('Snippet name is required')
  if (!input.body.trim()) throw new Error('Snippet body is required')
  if (!input.allProjects && input.projectIds.length === 0) {
    throw new Error('A project-scoped snippet must target at least one project')
  }
}

/** Normalize a snippet's persisted fields: trim the name, keep the body verbatim
 * (it is inserted as-is), and drop the explicit project list when it applies to
 * all projects. */
function normalize(input: SnippetInput): Omit<Snippet, 'id'> {
  return {
    name: input.name.trim(),
    body: input.body,
    allProjects: input.allProjects,
    projectIds: input.allProjects ? [] : [...input.projectIds],
  }
}

export async function createSnippet(file: string, input: SnippetInput, id: string): Promise<Snippet> {
  validate(input)
  const snippet: Snippet = { id, ...normalize(input) }
  await writeAll(file, [...(await readAll(file)), snippet])
  return snippet
}

export async function updateSnippet(file: string, id: string, input: SnippetInput): Promise<Snippet> {
  validate(input)
  const all = await readAll(file)
  const index = all.findIndex((snippet) => snippet.id === id)
  if (index === -1) throw new Error(`Snippet not found: ${id}`)
  const updated: Snippet = { id, ...normalize(input) }
  const next = [...all]
  next[index] = updated
  await writeAll(file, next)
  return updated
}

export async function deleteSnippet(file: string, id: string): Promise<void> {
  const all = await readAll(file)
  const next = all.filter((snippet) => snippet.id !== id)
  if (next.length !== all.length) {
    await writeAll(file, next)
  }
}
