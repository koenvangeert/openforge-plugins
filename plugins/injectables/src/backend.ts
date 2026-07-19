import { writeFile, mkdir, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, extname, join, sep } from 'node:path'
import { defineBackendPlugin } from '@openforge-app/plugin-sdk/backend'
import type { BackendOpenForgeAPI } from '@openforge-app/plugin-sdk/backend'
import { SKILL_SOURCE_DIRS, type SkillInfo, type SkillSourceDir } from './lib/skillDomain'
import { METHOD } from './lib/protocol'
import { createSnippet, deleteSnippet, listSnippets, snippetsFilePath, updateSnippet, type SnippetInput } from './backend/snippetFileStore'
import type { Snippet } from './lib/injectableDomain'

type SkillLevel = SkillInfo['level']

interface SaveSkillContentRequest {
  projectId: string | null
  name: string
  level: SkillLevel
  sourceDir: string
  sourcePath?: string | null
  content: string
  fileName?: string | null
  relativePath?: string | null
}

type DeleteSkillRequest = Omit<SaveSkillContentRequest, 'content'>

function codexHomeDir(): string {
  const codexHome = process.env.CODEX_HOME
  return codexHome && codexHome.length > 0 ? codexHome : join(homedir(), '.codex')
}

function skillSourceDir(root: string, sourceDir: string, level: SkillLevel): string {
  if (sourceDir === '.pi' && level === 'user') {
    return join(root, '.pi', 'agent', 'skills')
  }

  if (sourceDir === '.codex' && level === 'user') {
    return join(codexHomeDir(), 'skills')
  }

  return join(root, sourceDir, 'skills')
}

function isSupportedSkillSourceDir(sourceDir: string): sourceDir is SkillSourceDir {
  return (SKILL_SOURCE_DIRS as readonly string[]).includes(sourceDir)
}

function isValidRootMarkdownSkillFileName(fileName: string): boolean {
  return !fileName.startsWith('.') &&
    !fileName.includes('/') &&
    !fileName.includes('\\') &&
    basename(fileName) === fileName &&
    extname(fileName) === '.md' &&
    fileName.slice(0, -3).length > 0
}

function assertSafeSkillName(name: string): void {
  if (!name || name.includes('/') || name.includes('\\') || name.split(sep).length !== 1 || name === '.' || name === '..') {
    throw new Error(`Invalid skill name: ${name}`)
  }
}

function getValidatedRelativeSkillPathSegments(relativePath: string, sourceDir: string): string[] {
  if (!relativePath || relativePath.startsWith('/') || relativePath.includes('\\')) {
    throw new Error(`Invalid skill relative path: ${relativePath}`)
  }

  const parts = relativePath.split('/')
  if (parts.some(part => !part || part === '.' || part === '..')) {
    throw new Error(`Invalid skill relative path: ${relativePath}`)
  }

  if (parts.length === 1) {
    if (sourceDir !== '.pi' || !isValidRootMarkdownSkillFileName(parts[0])) {
      throw new Error(`Invalid skill relative path: ${relativePath}`)
    }
    return parts
  }

  if (parts.length === 2 && parts[1] === 'SKILL.md') {
    assertSafeSkillName(parts[0])
    return parts
  }

  throw new Error(`Invalid skill relative path: ${relativePath}`)
}

async function saveSkillContent(api: BackendOpenForgeAPI, request: SaveSkillContentRequest): Promise<void> {
  if (!isSupportedSkillSourceDir(request.sourceDir)) {
    throw new Error(`Unsupported skill source directory: ${request.sourceDir}`)
  }
  if (request.level !== 'project' && request.level !== 'user') {
    throw new Error(`Unsupported skill level: ${request.level}`)
  }

  const root = request.level === 'project'
    ? (request.projectId ? (await api.projects.get(request.projectId))?.path : undefined)
    : homedir()
  if (!root) {
    throw new Error(`Project not found: ${request.projectId}`)
  }

  const skillsDir = skillSourceDir(root, request.sourceDir, request.level)
  if (request.relativePath) {
    const relativePathParts = getValidatedRelativeSkillPathSegments(request.relativePath, request.sourceDir)
    await mkdir(join(skillsDir, ...relativePathParts.slice(0, -1)), { recursive: true })
    await writeFile(join(skillsDir, ...relativePathParts), request.content, 'utf8')
    return
  }

  if (request.fileName) {
    if (request.sourceDir !== '.pi') {
      throw new Error('Root markdown skill files are only supported for .pi skills')
    }
    if (!isValidRootMarkdownSkillFileName(request.fileName)) {
      throw new Error(`Invalid skill file name: ${request.fileName}`)
    }
    await mkdir(skillsDir, { recursive: true })
    await writeFile(join(skillsDir, request.fileName), request.content, 'utf8')
    return
  }

  const sourcePath = request.sourcePath ?? request.name
  assertSafeSkillName(sourcePath)
  const skillDir = join(skillsDir, sourcePath)
  await mkdir(skillDir, { recursive: true })
  await writeFile(join(skillDir, 'SKILL.md'), request.content, 'utf8')
}

/** Remove a skill from disk. Mirrors saveSkillContent's target resolution: a
 * directory-backed skill (SKILL.md nested under its folder) deletes the folder;
 * a root markdown skill (.pi) or a bare relative path deletes that file. */
async function deleteSkill(api: BackendOpenForgeAPI, request: DeleteSkillRequest): Promise<void> {
  if (!isSupportedSkillSourceDir(request.sourceDir)) {
    throw new Error(`Unsupported skill source directory: ${request.sourceDir}`)
  }
  if (request.level !== 'project' && request.level !== 'user') {
    throw new Error(`Unsupported skill level: ${request.level}`)
  }

  const root = request.level === 'project'
    ? (request.projectId ? (await api.projects.get(request.projectId))?.path : undefined)
    : homedir()
  if (!root) {
    throw new Error(`Project not found: ${request.projectId}`)
  }

  const skillsDir = skillSourceDir(root, request.sourceDir, request.level)
  let target: string
  if (request.relativePath) {
    const parts = getValidatedRelativeSkillPathSegments(request.relativePath, request.sourceDir)
    // A nested `<folder>/SKILL.md` deletes the folder; a bare file deletes the file.
    target = parts.length > 1 ? join(skillsDir, ...parts.slice(0, -1)) : join(skillsDir, ...parts)
  } else if (request.fileName) {
    target = join(skillsDir, request.fileName)
  } else {
    const sourcePath = request.sourcePath ?? request.name
    assertSafeSkillName(sourcePath)
    target = join(skillsDir, sourcePath)
  }
  await rm(target, { recursive: true, force: true })
}

export default defineBackendPlugin({
  activate(openforge, context) {
    context.subscriptions.add(openforge.backend.registerMethod<SaveSkillContentRequest, void>(METHOD.saveSkillContent, {
      input: {
        type: 'object',
        required: ['name', 'level', 'sourceDir', 'content'],
        properties: {
          projectId: { type: ['string', 'null'] },
          name: { type: 'string' },
          level: { enum: ['project', 'user'] },
          sourceDir: { type: 'string' },
          sourcePath: { type: ['string', 'null'] },
          content: { type: 'string' },
          fileName: { type: ['string', 'null'] },
          relativePath: { type: ['string', 'null'] },
        },
      },
      handler: (request) => saveSkillContent(openforge, request),
    }))

    context.subscriptions.add(openforge.backend.registerMethod<DeleteSkillRequest, void>(METHOD.deleteSkill, {
      input: {
        type: 'object',
        required: ['name', 'level', 'sourceDir'],
        properties: {
          projectId: { type: ['string', 'null'] },
          name: { type: 'string' },
          level: { enum: ['project', 'user'] },
          sourceDir: { type: 'string' },
          sourcePath: { type: ['string', 'null'] },
          fileName: { type: ['string', 'null'] },
          relativePath: { type: ['string', 'null'] },
        },
      },
      handler: (request) => deleteSkill(openforge, request),
    }))

    context.subscriptions.add(openforge.backend.registerMethod<null, Snippet[]>(METHOD.listSnippets, {
      input: { type: 'null' },
      handler: () => listSnippets(snippetsFilePath()),
    }))

    context.subscriptions.add(openforge.backend.registerMethod<SnippetInput, Snippet>(METHOD.createSnippet, {
      input: {
        type: 'object',
        required: ['name', 'body', 'allProjects', 'projectIds'],
        properties: {
          name: { type: 'string' },
          body: { type: 'string' },
          allProjects: { type: 'boolean' },
          projectIds: { type: 'array', items: { type: 'string' } },
        },
      },
      handler: (input) => createSnippet(snippetsFilePath(), input, crypto.randomUUID()),
    }))

    context.subscriptions.add(openforge.backend.registerMethod<SnippetInput & { id: string }, Snippet>(METHOD.updateSnippet, {
      input: {
        type: 'object',
        required: ['id', 'name', 'body', 'allProjects', 'projectIds'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          body: { type: 'string' },
          allProjects: { type: 'boolean' },
          projectIds: { type: 'array', items: { type: 'string' } },
        },
      },
      handler: ({ id, ...input }) => updateSnippet(snippetsFilePath(), id, input),
    }))

    context.subscriptions.add(openforge.backend.registerMethod<{ id: string }, void>(METHOD.deleteSnippet, {
      input: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      handler: (input) => deleteSnippet(snippetsFilePath(), input.id),
    }))
  },
})
