import type { CommandInfo } from '@openforge-app/plugin-sdk'
import type { Injectable, InjectableOrigin, InjectableTriggerMode, Snippet } from '../injectableDomain'

// Directories the picker (`insert` mode) offers for insertion. Historically this was
// Claude-only ('.claude', '.agents') because the picker only ever inserted into a Claude
// prompt; now that Codex/Pi/OpenCode/Grok sessions exist too, '.grok' is included so a
// Grok-authored skill is offered the same way a Claude-authored one is. '.opencode',
// '.codex', and '.pi' stay out of `insert` deliberately — unlike '.grok', nothing in this
// plugin has confirmed those tools resolve a plain `/name` the same way Claude and Grok do.
const INSERT_SKILL_DIRS = new Set(['.claude', '.agents', '.grok'])
// Every local skill directory the sidecar scans. The rail view browses all of them.
const ALL_SKILL_DIRS = new Set(['.claude', '.agents', '.opencode', '.codex', '.pi', '.grok'])
// builtin commands and plugin-provided items are always relevant regardless of source
// dir: a builtin never has one, and a plugin item may or may not (e.g. a Grok plugin
// skill does carry one — see GrokProvider::list_commands on the app side).
const CLAUDE_PROVIDED_ORIGINS = new Set(['builtin', 'plugin'])

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

function isRelevant(c: CommandInfo, mode: BrowseMode): boolean {
  // Tool/plugin-provided items are always relevant (no source dir to gate on).
  if (c.origin != null && CLAUDE_PROVIDED_ORIGINS.has(c.origin)) return true
  // Everything else — skills AND legacy .md commands — must live in a known source dir.
  // Under `insert` that drops .pi/.codex/.opencode skills and .opencode/commands. A
  // provider whose host-side discovery doesn't emit origin/sourceDir enrichment yields
  // an empty catalog here regardless of mode (no sourceDir to match against at all).
  // Under `manage` every scanned directory is kept.
  const allowed = mode === 'manage' ? ALL_SKILL_DIRS : INSERT_SKILL_DIRS
  return c.sourceDir != null && allowed.has(c.sourceDir)
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
  }
}

/**
 * Map the provider command list (plus the user's personal snippets) into the
 * picker's Claude-scoped Injectable view model. Drops non-Claude ecosystem
 * skills (.pi/.codex/.opencode) and hidden background skills.
 */
/** A snippet is visible in the active project when it targets all projects, or when
 * its explicit scope includes that project. With no active project only all-projects
 * snippets show. */
export function snippetVisibleIn(s: Snippet, projectId: string | null): boolean {
  return s.allProjects || (projectId !== null && s.projectIds.includes(projectId))
}

export function buildInjectables(input: {
  commands: CommandInfo[]
  snippets?: Snippet[]
  projectId?: string | null
  mode?: BrowseMode
}): Injectable[] {
  const projectId = input.projectId ?? null
  const mode = input.mode ?? 'insert'
  const commands = input.commands
    .filter((c) => isRelevant(c, mode) && c.userInvocable !== false)
    .map((c) => {
      const kind = c.source === 'skill' ? 'skill' : 'command'
      const origin = normOrigin(c.origin)
      return {
        // The source dir is part of the identity: the same skill name can exist in
        // several directories (e.g. ~/.claude/skills and ~/.codex/skills), and under
        // `all` scope both are listed, so name alone is not unique. Tool/plugin-provided
        // items carry no source dir and keep the shorter id.
        id: [origin, kind, c.sourceDir, c.name].filter(Boolean).join(':'),
        kind,
        name: c.name,
        description: c.description,
        origin,
        triggerMode: normTrigger(c.triggerMode),
        sourceDir: c.sourceDir ?? null,
        sourcePath: c.sourcePath ?? null,
        content: c.content ?? null,
        invocationText: `/${c.name} `,
      } satisfies Injectable
    })
  // `manage` keeps every snippet: the rail view is where you edit scope, so a snippet
  // must not disappear at the moment you remove the project you are standing in.
  const kept = (input.snippets ?? []).filter((s) => mode === 'manage' || snippetVisibleIn(s, projectId))
  // Those that are not available here sink to the bottom of the Snippets section — kept
  // for editing, but never pushing the usable ones down. Sorting is stable, so the
  // relative order inside each half is whatever the store returned.
  const ordered =
    mode === 'manage' && projectId !== null
      ? [...kept].sort(
          (a, b) =>
            Number(!snippetVisibleIn(a, projectId)) - Number(!snippetVisibleIn(b, projectId)),
        )
      : kept
  const snippets = ordered.map(snippetToInjectable)
  return [...snippets, ...commands]
}
