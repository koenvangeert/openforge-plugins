import type { CommandInfo, InstalledAiProvider } from '@openforge-app/plugin-sdk'
import type { LocalSkillRecord } from '../skillDomain'
import {
  compatibleInstalledProviders,
  folderAgentLabel,
  isLocalSkillDir,
  localSkillUsableWithProvider,
  unusableFolderReason,
} from '../folderCompatibility'
import type { Injectable, InjectableOrigin, InjectableTriggerMode, Snippet } from '../injectableDomain'

const CATALOG_ORIGINS = new Set(['builtin', 'plugin'])

/**
 * What the surface is for, which decides how much of the catalog it shows.
 *
 * - `insert` (default): the picker. Only what can be used in this context right now —
 *   skill dirs the active session's tool can actually resolve a plain `/name` from
 *   (`INSERT_SKILL_DIRS`), and snippets scoped to the active project.
 * - `manage`: the rail view. Everything that exists, so you can see and edit it —
 *   every scanned skill dir, and every snippet regardless of project scope. A snippet
 *   that is not available here still has to be visible, or removing the current project
 *   from its scope would make it vanish the instant you did it.
 */
export type BrowseMode = 'insert' | 'manage'
const ORIGINS = new Set<InjectableOrigin>(['personal', 'project', 'plugin', 'builtin'])
const TRIGGERS = new Set<InjectableTriggerMode>(['auto+manual', 'manual-only'])

function isCatalogRow(c: CommandInfo): boolean {
  return c.origin != null && CATALOG_ORIGINS.has(c.origin)
}

function normOrigin(v: string | null | undefined): InjectableOrigin {
  return v != null && ORIGINS.has(v as InjectableOrigin) ? (v as InjectableOrigin) : 'project'
}

function normTrigger(v: string | null | undefined): InjectableTriggerMode {
  return v != null && TRIGGERS.has(v as InjectableTriggerMode) ? (v as InjectableTriggerMode) : 'auto+manual'
}

/**
 * A personal snippet becomes a `kind:'snippet'` Injectable. It has no slash
 * identity or trigger mode, so origin/triggerMode carry unused sentinels
 * (`personal`/`manual-only`) that are never displayed; `sectionOf` routes it to
 * the dedicated "Snippets" section instead. Its `body` is both the preview
 * content and the literal text inserted on select.
 */
function snippetToInjectable(s: Snippet): Injectable {
  return {
    id: `snippet:${s.id}`,
    kind: 'snippet',
    name: s.name,
    description: null,
    origin: 'personal',
    triggerMode: 'manual-only',
    sourceDir: null,
    sourcePath: null,
    content: s.body,
    invocationText: s.body,
    pluginName: null,
    insertable: true,
    disabledReason: null,
    compatibleProviderIds: [],
    sourceAgent: null,
  }
}

function localSkillToInjectable(
  skill: LocalSkillRecord,
  provider: string | null,
  installed: readonly InstalledAiProvider[],
  mode: BrowseMode,
): Injectable {
  const compatible = compatibleInstalledProviders(skill.sourceDir, installed)
  const usableNow = localSkillUsableWithProvider(skill.sourceDir, provider)
  const insertable = mode === 'manage' || usableNow
  return {
    id: [skill.origin, 'skill', skill.sourceDir, skill.pluginName, skill.sourcePath, skill.name]
      .filter(Boolean)
      .join(':'),
    kind: 'skill',
    name: skill.name,
    description: skill.description,
    origin: skill.origin,
    triggerMode: 'auto+manual',
    sourceDir: skill.sourceDir,
    sourcePath: skill.sourcePath,
    content: skill.content,
    invocationText: `/${skill.name} `,
    pluginName: skill.pluginName,
    insertable,
    disabledReason: insertable || !isLocalSkillDir(skill.sourceDir) ? null : unusableFolderReason(provider, skill.sourceDir),
    compatibleProviderIds: compatible.map((item) => item.id),
    sourceAgent: folderAgentLabel(skill.sourceDir),
  }
}

function catalogAgentLabel(c: CommandInfo, provider: string | null): string | null {
  const fromFolder = folderAgentLabel(c.sourceDir)
  if (fromFolder) return fromFolder
  if (c.origin === 'builtin') {
    if (provider === 'grok') return 'Grok'
    if (provider === 'claude-code') return 'Claude'
  }
  return null
}

function catalogToInjectable(c: CommandInfo, provider: string | null): Injectable {
  const kind = c.source === 'skill' ? 'skill' : 'command'
  const origin = normOrigin(c.origin)
  return {
    id: [origin, kind, c.sourceDir, c.pluginName, c.name].filter(Boolean).join(':'),
    kind,
    name: c.name,
    description: c.description,
    origin,
    triggerMode: normTrigger(c.triggerMode),
    sourceDir: c.sourceDir ?? null,
    sourcePath: c.sourcePath ?? null,
    content: c.content ?? null,
    invocationText: `/${c.name} `,
    pluginName: c.pluginName ?? null,
    insertable: true,
    disabledReason: null,
    compatibleProviderIds: [],
    sourceAgent: catalogAgentLabel(c, provider),
  }
}

/** A snippet is visible in the active project when it targets all projects, or when
 * its explicit scope includes that project. With no active project only all-projects
 * snippets show. */
export function snippetVisibleIn(s: Snippet, projectId: string | null): boolean {
  return s.allProjects || (projectId !== null && s.projectIds.includes(projectId))
}

export function buildInjectables(input: {
  commands?: CommandInfo[]
  localSkills?: LocalSkillRecord[]
  snippets?: Snippet[]
  projectId?: string | null
  mode?: BrowseMode
  provider?: string | null
  installedProviders?: readonly InstalledAiProvider[]
}): Injectable[] {
  const projectId = input.projectId ?? null
  const mode = input.mode ?? 'insert'
  const provider = input.provider ?? null
  const installed = input.installedProviders ?? []
  const local = (input.localSkills ?? [])
    .filter((skill) => skill.userInvocable !== false)
    .map((skill) => localSkillToInjectable(skill, provider, installed, mode))
  const catalog = (input.commands ?? [])
    .filter((c) => isCatalogRow(c) && c.userInvocable !== false)
    .map((c) => catalogToInjectable(c, provider))
    .filter((item) => {
      // Grok's real plugin + bundled lists live on disk. The host catalog follows the
      // project default provider and would otherwise dump Claude builtins into Bundled.
      if (provider === 'grok' && (item.origin === 'plugin' || item.origin === 'builtin')) return false
      if (item.origin !== 'plugin' || !item.pluginName) return true
      return !local.some((row) => row.origin === 'plugin' && row.pluginName === item.pluginName && row.name === item.name)
    })
  const kept = (input.snippets ?? []).filter((s) => mode === 'manage' || snippetVisibleIn(s, projectId))
  const ordered =
    mode === 'manage' && projectId !== null
      ? [...kept].sort(
          (a, b) =>
            Number(!snippetVisibleIn(a, projectId)) - Number(!snippetVisibleIn(b, projectId)),
        )
      : kept
  return uniquifyIds([...ordered.map(snippetToInjectable), ...local, ...catalog])
}

function uniquifyIds(items: Injectable[]): Injectable[] {
  const seen = new Map<string, number>()
  return items.map((item) => {
    const count = seen.get(item.id) ?? 0
    seen.set(item.id, count + 1)
    if (count === 0) return item
    return { ...item, id: `${item.id}:${count}` }
  })
}
