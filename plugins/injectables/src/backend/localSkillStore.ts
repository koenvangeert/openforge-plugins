import { readdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, extname, join, relative } from 'node:path'
import { LOCAL_SKILL_DIRS } from '../lib/folderCompatibility'
import type { LocalSkillRecord } from '../lib/skillDomain'

export type { LocalSkillRecord }

function codexHomeDir(): string {
  const codexHome = process.env.CODEX_HOME
  return codexHome && codexHome.length > 0 ? codexHome : join(homedir(), '.codex')
}

export function skillSourceDir(root: string, sourceDir: string, level: 'project' | 'user'): string {
  if (sourceDir === '.pi' && level === 'user') {
    return join(root, '.pi', 'agent', 'skills')
  }
  if (sourceDir === '.codex' && level === 'user') {
    return join(codexHomeDir(), 'skills')
  }
  return join(root, sourceDir, 'skills')
}

function parseFrontmatter(content: string): {
  name: string | null
  description: string | null
  userInvocable: boolean | null
} {
  if (!content.startsWith('---')) {
    return { name: null, description: null, userInvocable: null }
  }
  const end = content.indexOf('\n---', 3)
  if (end === -1) return { name: null, description: null, userInvocable: null }
  const block = content.slice(3, end)
  let name: string | null = null
  let description: string | null = null
  let userInvocable: boolean | null = null
  for (const raw of block.split('\n')) {
    const line = raw.trim()
    const match = /^(name|description|user-invocable):\s*(.*)$/.exec(line)
    if (!match) continue
    const value = match[2].trim().replace(/^['"]|['"]$/g, '')
    if (match[1] === 'name') name = value || null
    else if (match[1] === 'description') description = value || null
    else if (value === 'true' || value === 'yes') userInvocable = true
    else if (value === 'false' || value === 'no') userInvocable = false
  }
  return { name, description, userInvocable }
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'marketplaces'])

async function readSkillRecord(
  skillMdPath: string,
  skillsRoot: string,
  origin: LocalSkillRecord['origin'],
  sourceDir: string,
  pluginName: string | null,
): Promise<LocalSkillRecord | null> {
  let content: string
  try {
    content = await readFile(skillMdPath, 'utf8')
  } catch {
    return null
  }
  const folder = basename(join(skillMdPath, '..'))
  const rel = relative(skillsRoot, join(skillMdPath, '..'))
  const meta = parseFrontmatter(content)
  return {
    name: meta.name ?? folder,
    description: meta.description,
    origin,
    sourceDir,
    sourcePath: rel === '' ? folder : rel,
    content,
    userInvocable: meta.userInvocable,
    pluginName,
  }
}

async function scanSkillMdTree(
  dir: string,
  origin: LocalSkillRecord['origin'],
  sourceDir: string,
  pluginName: string | null,
): Promise<LocalSkillRecord[]> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  if (entries.some((entry) => entry.isFile() && entry.name === 'SKILL.md')) {
    const record = await readSkillRecord(join(dir, 'SKILL.md'), dir, origin, sourceDir, pluginName)
    return record ? [record] : []
  }
  const skills: LocalSkillRecord[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() || SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue
    const child = join(dir, entry.name)
    const nestedMd = join(child, 'SKILL.md')
    let hasSkill = false
    try {
      await readFile(nestedMd, 'utf8')
      hasSkill = true
    } catch {
      hasSkill = false
    }
    if (hasSkill) {
      const record = await readSkillRecord(nestedMd, dir, origin, sourceDir, pluginName)
      if (record) skills.push(record)
      continue
    }
    skills.push(...(await scanSkillMdTree(child, origin, sourceDir, pluginName)))
  }
  return skills
}

async function scanSkillsDirectory(
  dir: string,
  origin: 'personal' | 'project',
  sourceDir: string,
): Promise<LocalSkillRecord[]> {
  const skills = await scanSkillMdTree(dir, origin, sourceDir, null)
  if (sourceDir !== '.pi') return skills
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return skills
  }
  for (const entry of entries) {
    if (!entry.isFile() || extname(entry.name) !== '.md' || entry.name.startsWith('.') || entry.name === 'SKILL.md') {
      continue
    }
    let content: string
    try {
      content = await readFile(join(dir, entry.name), 'utf8')
    } catch {
      continue
    }
    const meta = parseFrontmatter(content)
    skills.push({
      name: meta.name ?? entry.name.replace(/\.md$/, ''),
      description: meta.description,
      origin,
      sourceDir,
      sourcePath: entry.name,
      content,
      userInvocable: meta.userInvocable,
      pluginName: null,
    })
  }
  return skills
}

async function scanClassicGrokPlugins(root: string): Promise<LocalSkillRecord[]> {
  const pluginsDir = join(root, '.grok', 'plugins')
  let entries
  try {
    entries = await readdir(pluginsDir, { withFileTypes: true })
  } catch {
    return []
  }
  const skills: LocalSkillRecord[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === 'marketplaces') continue
    skills.push(
      ...(await scanSkillMdTree(join(pluginsDir, entry.name, 'skills'), 'plugin', '.grok', entry.name)),
    )
  }
  return skills
}

async function grokPluginNamesByInstallPath(home: string): Promise<Map<string, string>> {
  const names = new Map<string, string>()
  let raw: string
  try {
    raw = await readFile(join(home, '.grok', 'installed-plugins', 'registry.json'), 'utf8')
  } catch {
    return names
  }
  try {
    const registry = JSON.parse(raw) as {
      repos?: Record<string, { path?: string; plugins?: Record<string, unknown> }>
    }
    for (const repo of Object.values(registry.repos ?? {})) {
      if (!repo.path) continue
      const pluginNames = Object.keys(repo.plugins ?? {})
      const name = pluginNames[0] ?? basename(repo.path)
      names.set(repo.path, name)
    }
  } catch {
    return names
  }
  return names
}

async function scanGrokInstalledPlugins(home: string): Promise<LocalSkillRecord[]> {
  const root = join(home, '.grok', 'installed-plugins')
  const names = await grokPluginNamesByInstallPath(home)
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return []
  }
  const skills: LocalSkillRecord[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const installPath = join(root, entry.name)
    const pluginName = names.get(installPath) ?? entry.name.replace(/-[a-f0-9]{8}$/, '')
    skills.push(...(await scanSkillMdTree(join(installPath, 'skills'), 'plugin', '.grok', pluginName)))
  }
  return skills
}

async function scanGrokBundledSkills(home: string): Promise<LocalSkillRecord[]> {
  return scanSkillMdTree(join(home, '.grok', 'bundled', 'skills'), 'builtin', '.grok', null)
}

async function scanClaudeInstalledPlugins(home: string): Promise<LocalSkillRecord[]> {
  let raw: string
  try {
    raw = await readFile(join(home, '.claude', 'plugins', 'installed_plugins.json'), 'utf8')
  } catch {
    return []
  }
  let plugins: Record<string, Array<{ scope?: string; installPath?: string }>>
  try {
    const data = JSON.parse(raw) as { plugins?: Record<string, Array<{ scope?: string; installPath?: string }>> }
    plugins = data.plugins ?? {}
  } catch {
    return []
  }
  const skills: LocalSkillRecord[] = []
  for (const [key, entries] of Object.entries(plugins)) {
    const pluginName = key.split('@')[0] ?? key
    for (const entry of entries ?? []) {
      if (!entry.installPath || entry.scope === 'project' || entry.scope === 'local') continue
      skills.push(...(await scanSkillMdTree(join(entry.installPath, 'skills'), 'plugin', '.claude', pluginName)))
    }
  }
  return skills
}

export async function listLocalSkillsFromRoots(
  userRoot: string,
  projectRoot: string | null,
): Promise<LocalSkillRecord[]> {
  const skills: LocalSkillRecord[] = []
  for (const sourceDir of LOCAL_SKILL_DIRS) {
    skills.push(...(await scanSkillsDirectory(skillSourceDir(userRoot, sourceDir, 'user'), 'personal', sourceDir)))
    if (projectRoot) {
      skills.push(
        ...(await scanSkillsDirectory(skillSourceDir(projectRoot, sourceDir, 'project'), 'project', sourceDir)),
      )
    }
  }
  skills.push(...(await scanClassicGrokPlugins(userRoot)))
  if (projectRoot) skills.push(...(await scanClassicGrokPlugins(projectRoot)))
  skills.push(...(await scanGrokInstalledPlugins(userRoot)))
  skills.push(...(await scanGrokBundledSkills(userRoot)))
  skills.push(...(await scanClaudeInstalledPlugins(userRoot)))
  return skills
}
