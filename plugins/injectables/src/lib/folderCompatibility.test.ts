import { describe, expect, it } from 'vitest'
import {
  compatibleInstalledProviders,
  folderAgentLabel,
  localSkillUsableWithProvider,
  unusableFolderReason,
} from './folderCompatibility'

describe('localSkillUsableWithProvider', () => {
  it('lets Grok use .claude and .agents as well as .grok', () => {
    expect(localSkillUsableWithProvider('.grok', 'grok')).toBe(true)
    expect(localSkillUsableWithProvider('.claude', 'grok')).toBe(true)
    expect(localSkillUsableWithProvider('.agents', 'grok')).toBe(true)
    expect(localSkillUsableWithProvider('.codex', 'grok')).toBe(false)
  })

  it('lets Claude use only .claude', () => {
    expect(localSkillUsableWithProvider('.claude', 'claude-code')).toBe(true)
    expect(localSkillUsableWithProvider('.agents', 'claude-code')).toBe(false)
    expect(localSkillUsableWithProvider('.grok', 'claude-code')).toBe(false)
  })

  it('lets Codex and Pi use .agents plus their own folder', () => {
    expect(localSkillUsableWithProvider('.agents', 'codex')).toBe(true)
    expect(localSkillUsableWithProvider('.codex', 'codex')).toBe(true)
    expect(localSkillUsableWithProvider('.claude', 'codex')).toBe(false)
    expect(localSkillUsableWithProvider('.agents', 'pi')).toBe(true)
    expect(localSkillUsableWithProvider('.pi', 'pi')).toBe(true)
    expect(localSkillUsableWithProvider('.claude', 'pi')).toBe(false)
  })

  it('lets OpenCode use .opencode, .claude, and .agents', () => {
    expect(localSkillUsableWithProvider('.opencode', 'opencode')).toBe(true)
    expect(localSkillUsableWithProvider('.claude', 'opencode')).toBe(true)
    expect(localSkillUsableWithProvider('.agents', 'opencode')).toBe(true)
    expect(localSkillUsableWithProvider('.grok', 'opencode')).toBe(false)
  })

  it('does not treat plugin or builtin rows as folder-compatible', () => {
    expect(localSkillUsableWithProvider(null, 'grok')).toBe(false)
  })
})

describe('compatibleInstalledProviders', () => {
  const grok = { id: 'grok' as const, displayName: 'Grok' }
  const claude = { id: 'claude-code' as const, displayName: 'Claude Code' }
  const pi = { id: 'pi' as const, displayName: 'Pi Coding Agent' }

  it('labels a .agents skill as Grok-only when Claude is also installed', () => {
    expect(compatibleInstalledProviders('.agents', [grok, claude]).map((item) => item.id)).toEqual(['grok'])
  })

  it('returns no providers for a .pi skill when Pi is not installed', () => {
    expect(compatibleInstalledProviders('.pi', [grok, claude])).toEqual([])
    expect(compatibleInstalledProviders('.pi', [grok, claude, pi]).map((item) => item.id)).toEqual(['pi'])
  })
})

describe('folderAgentLabel', () => {
  it('names Claude and Grok from their folders', () => {
    expect(folderAgentLabel('.grok')).toBe('Grok')
    expect(folderAgentLabel('.claude')).toBe('Claude')
  })
})

describe('unusableFolderReason', () => {
  it('names the provider and the folder', () => {
    expect(unusableFolderReason('claude-code', '.grok')).toBe('Won’t work with Claude Code — lives in .grok')
  })
})
