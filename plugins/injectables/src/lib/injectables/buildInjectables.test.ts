import { describe, it, expect } from 'vitest'
import { buildInjectables } from './buildInjectables'
import type { CommandInfo } from '@openforge-app/plugin-sdk'
import type { LocalSkillRecord } from '../skillDomain'

const cmd = (over: Partial<CommandInfo>): CommandInfo => ({
  name: 'x',
  description: null,
  source: 'skill',
  agent: null,
  origin: 'plugin',
  pluginName: 'mattpocock-skills',
  triggerMode: 'auto+manual',
  userInvocable: null,
  sourceDir: null,
  sourcePath: 'x',
  ...over,
})

const local = (over: Partial<LocalSkillRecord>): LocalSkillRecord => ({
  name: 'x',
  description: null,
  origin: 'project',
  sourceDir: '.claude',
  sourcePath: 'x',
  content: null,
  userInvocable: null,
  pluginName: null,
  ...over,
})

describe('buildInjectables', () => {
  it('lists every local folder in insert mode and greys out ones the provider cannot use', () => {
    const out = buildInjectables({
      commands: [],
      localSkills: [local({ name: 'keep', sourceDir: '.claude' }), local({ name: 'drop', sourceDir: '.pi', sourcePath: 'drop' })],
      provider: 'claude-code',
    })
    expect(out.map((i) => i.name)).toEqual(['keep', 'drop'])
    expect(out.find((i) => i.name === 'keep')?.insertable).toBe(true)
    expect(out.find((i) => i.name === 'drop')?.insertable).toBe(false)
    expect(out.find((i) => i.name === 'drop')?.disabledReason).toContain('.pi')
  })

  it('labels .grok skills as Grok and .claude skills as Claude', () => {
    const out = buildInjectables({
      localSkills: [
        local({ name: 'g', sourceDir: '.grok', sourcePath: 'g' }),
        local({ name: 'c', sourceDir: '.claude', sourcePath: 'c' }),
      ],
      provider: 'grok',
    })
    expect(out.find((item) => item.name === 'g')?.sourceAgent).toBe('Grok')
    expect(out.find((item) => item.name === 'c')?.sourceAgent).toBe('Claude')
  })

  it('keeps a snippet insertable for every provider', () => {
    const out = buildInjectables({
      commands: [],
      snippets: [{ id: 's1', name: 'Here', body: 'x', allProjects: true, projectIds: [] }],
      provider: 'claude-code',
    })
    expect(out[0]?.insertable).toBe(true)
  })

  it('does not mix Claude catalog builtins into a Grok insert list', () => {
    const out = buildInjectables({
      commands: [cmd({ name: 'compact', source: 'builtin', origin: 'builtin', sourceDir: null, pluginName: null })],
      localSkills: [
        local({ name: 'review', origin: 'builtin', sourceDir: '.grok', sourcePath: 'review', pluginName: null }),
      ],
      provider: 'grok',
    })
    expect(out.map((item) => item.name)).toEqual(['review'])
    expect(out[0]?.sourceAgent).toBe('Grok')
  })

  it('does not use sourceDir as a proxy for plugin or builtin rows', () => {
    const out = buildInjectables({
      commands: [
        cmd({ name: 'pluginc', origin: 'plugin', sourceDir: '.grok' }),
        cmd({ name: 'builtinc', source: 'builtin', origin: 'builtin', sourceDir: null, pluginName: null }),
      ],
      provider: 'claude-code',
    })
    expect(out.map((i) => i.name).sort()).toEqual(['builtinc', 'pluginc'])
    expect(out.every((i) => i.insertable)).toBe(true)
  })

  it('keeps every local skill directory under manage mode', () => {
    const out = buildInjectables({
      commands: [],
      localSkills: [
        local({ name: 'claudeskill', sourceDir: '.claude', sourcePath: 'claudeskill' }),
        local({ name: 'codexskill', sourceDir: '.codex', sourcePath: 'codexskill' }),
        local({ name: 'piskill', sourceDir: '.pi', sourcePath: 'piskill' }),
        local({ name: 'opencodeskill', sourceDir: '.opencode', sourcePath: 'opencodeskill' }),
        local({ name: 'grokskill', sourceDir: '.grok', sourcePath: 'grokskill' }),
      ],
      mode: 'manage',
    })
    expect(out.map((i) => i.name).sort()).toEqual([
      'claudeskill',
      'codexskill',
      'grokskill',
      'opencodeskill',
      'piskill',
    ])
  })

  it('hides snippets outside the active project when inserting', () => {
    const out = buildInjectables({
      commands: [],
      snippets: [
        { id: 's1', name: 'Here', body: 'x', allProjects: false, projectIds: ['P-1'] },
        { id: 's2', name: 'Elsewhere', body: 'y', allProjects: false, projectIds: ['P-2'] },
      ],
      projectId: 'P-1',
    })
    expect(out.map((i) => i.name)).toEqual(['Here'])
  })

  it('keeps snippets outside the active project when managing', () => {
    // Removing the current project from a snippet's scope happens in the rail view, so
    // the snippet has to stay listed — otherwise it vanishes the instant you do it.
    const out = buildInjectables({
      commands: [],
      snippets: [
        { id: 's1', name: 'Here', body: 'x', allProjects: false, projectIds: ['P-1'] },
        { id: 's2', name: 'Elsewhere', body: 'y', allProjects: false, projectIds: ['P-2'] },
      ],
      projectId: 'P-1',
      mode: 'manage',
    })
    expect(out.map((i) => i.name).sort()).toEqual(['Elsewhere', 'Here'])
  })

  it('sinks snippets outside the active project to the bottom when managing', () => {
    // Interleaved on the way in, so the assertion proves ordering rather than luck.
    const out = buildInjectables({
      commands: [],
      snippets: [
        { id: 's1', name: 'Away A', body: 'x', allProjects: false, projectIds: ['P-2'] },
        { id: 's2', name: 'Here A', body: 'x', allProjects: false, projectIds: ['P-1'] },
        { id: 's3', name: 'Away B', body: 'x', allProjects: false, projectIds: ['P-2'] },
        { id: 's4', name: 'Here B', body: 'x', allProjects: true, projectIds: [] },
      ],
      projectId: 'P-1',
      mode: 'manage',
    })
    // Available ones first, each half keeping the order it arrived in.
    expect(out.map((i) => i.name)).toEqual(['Here A', 'Here B', 'Away A', 'Away B'])
  })

  it('gives same-named nested plugin skills distinct ids', () => {
    const out = buildInjectables({
      localSkills: [
        local({
          name: 'tdd',
          origin: 'plugin',
          pluginName: 'mattpocock-skills',
          sourceDir: '.claude',
          sourcePath: 'engineering/tdd',
        }),
        local({
          name: 'tdd',
          origin: 'plugin',
          pluginName: 'mattpocock-skills',
          sourceDir: '.claude',
          sourcePath: 'tdd',
        }),
      ],
    })
    expect(out).toHaveLength(2)
    expect(new Set(out.map((item) => item.id)).size).toBe(2)
  })

  it('gives same-named skills in different directories distinct ids', () => {
    const out = buildInjectables({
      localSkills: [
        local({ name: 'openforge', origin: 'personal', sourceDir: '.claude', sourcePath: 'openforge' }),
        local({ name: 'openforge', origin: 'personal', sourceDir: '.codex', sourcePath: 'openforge' }),
      ],
      mode: 'manage',
    })
    expect(out).toHaveLength(2)
    expect(new Set(out.map((i) => i.id)).size).toBe(2)
  })

  it('keeps plugin and builtin catalog rows and local .agents skills', () => {
    const out = buildInjectables({
      commands: [
        cmd({ name: 'pluginc', source: 'plugin', origin: 'plugin', sourceDir: null }),
        cmd({ name: 'builtinc', source: 'builtin', origin: 'builtin', sourceDir: null, pluginName: null }),
      ],
      localSkills: [local({ name: 'agentskill', sourceDir: '.agents', sourcePath: 'agentskill' })],
      provider: 'claude-code',
    })
    expect(out.map((i) => i.name).sort()).toEqual(['agentskill', 'builtinc', 'pluginc'])
  })

  it('drops host catalog rows that are not plugin or builtin', () => {
    const out = buildInjectables({
      commands: [
        cmd({ name: 'keepcmd', source: 'command', origin: 'project', sourceDir: '.claude' }),
        { name: 'oc', description: null, source: 'command', agent: null } as unknown as CommandInfo,
      ],
    })
    expect(out).toHaveLength(0)
  })

  it('drops user-invocable:false items', () => {
    const out = buildInjectables({
      commands: [cmd({ name: 'bg', userInvocable: false })],
      localSkills: [local({ name: 'hidden', userInvocable: false })],
    })
    expect(out).toHaveLength(0)
  })

  it('maps kind, id and invocationText for a local skill', () => {
    const [i] = buildInjectables({
      localSkills: [local({ name: 'refactor', origin: 'project', sourceDir: '.claude', sourcePath: 'refactor' })],
      provider: 'claude-code',
    })
    expect(i).toMatchObject({
      id: 'project:skill:.claude:refactor:refactor',
      kind: 'skill',
      invocationText: '/refactor ',
    })
  })

  it('carries the source dir and folder identity for edit/delete; null when absent', () => {
    const [skill] = buildInjectables({
      localSkills: [local({ name: 's', sourceDir: '.claude', sourcePath: 's' })],
      provider: 'claude-code',
    })
    expect(skill).toMatchObject({ sourceDir: '.claude', sourcePath: 's' })
    const [builtin] = buildInjectables({
      commands: [cmd({ name: 'init', source: 'builtin', origin: 'builtin', sourceDir: null, pluginName: null })],
    })
    expect(builtin.sourceDir).toBeNull()
  })

  it('carries source content for the reading pane; null when absent', () => {
    const [skill] = buildInjectables({
      localSkills: [local({ name: 's', content: '---\nname: s\n---\nbody' })],
      provider: 'claude-code',
    })
    expect(skill.content).toContain('body')
    const [builtin] = buildInjectables({
      commands: [cmd({ name: 'init', source: 'builtin', origin: 'builtin', sourceDir: null, pluginName: null, content: undefined })],
    })
    expect(builtin.content).toBeNull()
  })

  it('maps a command to kind "command"', () => {
    const [i] = buildInjectables({
      commands: [cmd({ name: 'init', source: 'builtin', origin: 'builtin', sourceDir: null, pluginName: null })],
    })
    expect(i).toMatchObject({ id: 'builtin:command:init', kind: 'command' })
  })

  it('normalizes unknown trigger to a safe default', () => {
    const [i] = buildInjectables({
      commands: [cmd({ name: 'weird', origin: 'plugin', triggerMode: 'huh' as unknown as string })],
    })
    expect(i.origin).toBe('plugin')
    expect(i.triggerMode).toBe('auto+manual')
  })

  it('maps snippets into snippet injectables (id, content and invocationText = body)', () => {
    const out = buildInjectables({
      commands: [],
      snippets: [{ id: 'abc-123', name: 'PR boilerplate', body: '## Summary\n\n- ', allProjects: true, projectIds: [] }],
    })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      id: 'snippet:abc-123',
      kind: 'snippet',
      name: 'PR boilerplate',
      origin: 'personal',
      content: '## Summary\n\n- ',
      invocationText: '## Summary\n\n- ',
      sourceDir: null,
      sourcePath: null,
    })
  })

  it('includes both snippets and catalog rows; omitting snippets yields none', () => {
    const both = buildInjectables({
      commands: [cmd({ name: 'skill1' })],
      snippets: [{ id: 's1', name: 'snip', body: 'text', allProjects: true, projectIds: [] }],
    })
    expect(both.map((i) => i.kind).sort()).toEqual(['skill', 'snippet'])
    const commandsOnly = buildInjectables({ commands: [cmd({ name: 'skill1' })] })
    expect(commandsOnly.some((i) => i.kind === 'snippet')).toBe(false)
  })

  it('shows all-projects snippets in any (or no) active project', () => {
    const snippets = [{ id: 'a', name: 'everywhere', body: 'x', allProjects: true, projectIds: [] }]
    expect(buildInjectables({ commands: [], snippets, projectId: 'P-9' }).map((i) => i.name)).toEqual(['everywhere'])
    expect(buildInjectables({ commands: [], snippets, projectId: null }).map((i) => i.name)).toEqual(['everywhere'])
  })

  it('shows a project-scoped snippet only for the projects it targets', () => {
    const snippets = [{ id: 'b', name: 'scoped', body: 'x', allProjects: false, projectIds: ['P-1'] }]
    expect(buildInjectables({ commands: [], snippets, projectId: 'P-1' }).map((i) => i.name)).toEqual(['scoped'])
    expect(buildInjectables({ commands: [], snippets, projectId: 'P-2' }).map((i) => i.name)).toEqual([])
    expect(buildInjectables({ commands: [], snippets, projectId: null }).map((i) => i.name)).toEqual([])
  })
})
