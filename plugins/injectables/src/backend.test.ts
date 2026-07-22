import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockedUserHome = vi.hoisted(() => ({ path: '' }))

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>()
  return {
    ...actual,
    default: { ...actual, homedir: () => mockedUserHome.path },
    homedir: () => mockedUserHome.path,
  }
})

import backend from './backend'

function tempRoot(): string {
  return process.env.TMPDIR || '/tmp'
}

type BackendMethodHandler = (input: unknown) => Promise<unknown> | unknown

async function activateBackendWithProject(projectPath: string): Promise<Map<string, BackendMethodHandler>> {
  const methods = new Map<string, BackendMethodHandler>()
  const api = {
    backend: {
      registerMethod: vi.fn((method: string, registration: { handler: BackendMethodHandler }) => {
        methods.set(method, registration.handler)
        return { dispose: vi.fn() }
      }),
    },
    projects: {
      get: vi.fn(async (projectId: string) => ({ id: projectId, name: 'Project', path: projectPath, created_at: 1, updated_at: 1 })),
    },
  }

  await backend.activate(api as never, {
    pluginId: 'com.openforge.injectables',
    apiVersion: 1,
    packageMetadata: {
      id: 'com.openforge.injectables',
      apiVersion: 1,
      displayName: 'Injectables',
      description: 'Browse and insert Claude skills, slash-commands, and personal snippets',
    },
    subscriptions: { add: vi.fn() },
  })

  return methods
}

async function createSkillFile(root: string, sourcePath: string, content: string): Promise<void> {
  const fullPath = join(root, sourcePath)
  await mkdir(dirname(fullPath), { recursive: true })
  await writeFile(fullPath, content)
}

describe('injectables backend skill file operations', () => {
  beforeEach(async () => {
    delete process.env.CODEX_HOME
    mockedUserHome.path = await mkdtemp(join(tempRoot(), 'injectables-user-home-'))
  })

  it('saves directory skills to the requested relative path instead of the frontmatter name folder', async () => {
    const projectPath = await mkdtemp(join(tempRoot(), 'injectables-project-'))
    const original = `---\nname: review\ndescription: Alpha review\n---\n# Alpha\n`
    const updated = `---\nname: review\ndescription: Updated alpha\n---\n# Updated Alpha\n`
    await createSkillFile(projectPath, '.agents/skills/alpha/SKILL.md', original)

    const methods = await activateBackendWithProject(projectPath)
    await methods.get('saveSkillContent')?.({
      projectId: 'P-1',
      name: 'review',
      level: 'project',
      sourceDir: '.agents',
      content: updated,
      fileName: null,
      relativePath: 'alpha/SKILL.md',
    })

    await expect(readFile(join(projectPath, '.agents/skills/alpha/SKILL.md'), 'utf8')).resolves.toBe(updated)
    await expect(readFile(join(projectPath, '.agents/skills/review/SKILL.md'), 'utf8')).rejects.toThrow()
  })

  it('rejects unsafe relative save paths', async () => {
    const projectPath = await mkdtemp(join(tempRoot(), 'injectables-project-'))
    const methods = await activateBackendWithProject(projectPath)
    const saveSkillContent = methods.get('saveSkillContent')
    const baseRequest = {
      projectId: 'P-1',
      name: 'review',
      level: 'project',
      sourceDir: '.agents',
      content: '# Unsafe',
      fileName: null,
    }

    for (const relativePath of ['../escape/SKILL.md', '/tmp/SKILL.md', 'alpha/../SKILL.md', 'alpha/other.md', 'nested/deeper/SKILL.md', 'root.md']) {
      await expect(saveSkillContent?.({ ...baseRequest, relativePath })).rejects.toThrow(/Invalid skill relative path/)
    }
  })

  it('saves user Codex skills under CODEX_HOME when configured', async () => {
    const projectPath = await mkdtemp(join(tempRoot(), 'injectables-project-'))
    const userPath = await mkdtemp(join(tempRoot(), 'injectables-user-'))
    const codexHome = await mkdtemp(join(tempRoot(), 'injectables-codex-home-'))
    mockedUserHome.path = userPath
    process.env.CODEX_HOME = codexHome

    const methods = await activateBackendWithProject(projectPath)
    await methods.get('saveSkillContent')?.({
      projectId: 'P-1',
      name: 'new-codex',
      level: 'user',
      sourceDir: '.codex',
      content: '# New Codex\n',
      relativePath: 'new-codex/SKILL.md',
    })

    await expect(readFile(join(codexHome, 'skills', 'new-codex', 'SKILL.md'), 'utf8')).resolves.toBe('# New Codex\n')
    await expect(readFile(join(userPath, '.codex', 'skills', 'new-codex', 'SKILL.md'), 'utf8')).rejects.toThrow()
  })

  it('saves directory-backed skills by listed source folder instead of frontmatter name', async () => {
    const projectPath = await mkdtemp(join(tempRoot(), 'injectables-project-'))
    // Folder name ('folder-review') and frontmatter name ('display-review') differ; the
    // save must target the folder, not a path derived from the frontmatter name.
    await createSkillFile(projectPath, '.agents/skills/folder-review/SKILL.md', `---\nname: display-review\ndescription: Display name\n---\n# Before\n`)

    const methods = await activateBackendWithProject(projectPath)

    await methods.get('saveSkillContent')?.({
      projectId: 'P-1',
      name: 'display-review',
      sourcePath: 'folder-review',
      level: 'project',
      sourceDir: '.agents',
      content: '# After\n',
    })

    await expect(readFile(join(projectPath, '.agents/skills/folder-review/SKILL.md'), 'utf8')).resolves.toBe('# After\n')
    await expect(stat(join(projectPath, '.agents/skills/display-review'))).rejects.toThrow()
  })

  it('deleteSkill removes the skill directory from disk', async () => {
    const projectPath = await mkdtemp(join(tempRoot(), 'injectables-project-'))
    await createSkillFile(projectPath, '.agents/skills/review/SKILL.md', `---\nname: review\n---\n# Review\n`)

    const methods = await activateBackendWithProject(projectPath)
    await expect(stat(join(projectPath, '.agents/skills/review'))).resolves.toBeTruthy()

    await methods.get('deleteSkill')?.({
      projectId: 'P-1',
      name: 'review',
      level: 'project',
      sourceDir: '.agents',
      sourcePath: 'review',
      relativePath: 'review/SKILL.md',
      fileName: null,
    })

    await expect(stat(join(projectPath, '.agents/skills/review'))).rejects.toThrow()
  })
})

describe('injectables backend method registration', () => {
  beforeEach(async () => {
    delete process.env.CODEX_HOME
    mockedUserHome.path = await mkdtemp(join(tempRoot(), 'injectables-user-home-'))
  })

  it('registers all six backend methods', async () => {
    const projectPath = await mkdtemp(join(tempRoot(), 'injectables-project-'))
    const methods = await activateBackendWithProject(projectPath)

    for (const name of ['saveSkillContent', 'deleteSkill', 'listSnippets', 'createSnippet', 'updateSnippet', 'deleteSnippet']) {
      expect(methods.has(name)).toBe(true)
    }
  })
})

describe('injectables backend snippet filesystem round-trip', () => {
  let snippetsDir: string

  beforeEach(async () => {
    delete process.env.CODEX_HOME
    mockedUserHome.path = await mkdtemp(join(tempRoot(), 'injectables-user-home-'))
    snippetsDir = await mkdtemp(join(tempRoot(), 'injectables-snippets-env-'))
    process.env.OPENFORGE_INJECTABLES_DIR = snippetsDir
  })

  afterEach(async () => {
    delete process.env.OPENFORGE_INJECTABLES_DIR
    await rm(snippetsDir, { recursive: true, force: true })
  })

  it('creates a snippet through the registered handler and lists it back with a generated id', async () => {
    const projectPath = await mkdtemp(join(tempRoot(), 'injectables-project-'))
    const methods = await activateBackendWithProject(projectPath)

    const created = await methods.get('createSnippet')?.({ name: 'PR', body: '## Summary\n\n- ', allProjects: true, projectIds: [] })
    expect(created).toMatchObject({ name: 'PR', body: '## Summary\n\n- ', allProjects: true, projectIds: [] })
    expect((created as { id: string }).id).toBeTruthy()

    const listed = await methods.get('listSnippets')?.(null)
    expect(listed).toEqual([created])
  })
})
