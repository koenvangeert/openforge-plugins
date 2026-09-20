import { describe, expect, it } from 'vitest'
import type { Injectable } from './injectableDomain'
import { invalidInsertedSkillNames, skillTokenNames } from './promptSkillTokens'

const skill = (over: Partial<Injectable>): Injectable => ({
  id: 'personal:skill:x',
  kind: 'skill',
  name: 'x',
  description: null,
  origin: 'personal',
  triggerMode: 'auto+manual',
  sourceDir: '.grok',
  sourcePath: 'x',
  content: null,
  invocationText: '/x ',
  pluginName: null,
  insertable: false,
  disabledReason: 'Won’t work with Claude Code — lives in .grok',
  compatibleProviderIds: ['grok'],
  sourceAgent: 'Grok',
  ...over,
})

describe('skillTokenNames', () => {
  it('finds slash and dollar tokens', () => {
    expect(skillTokenNames('Please /refactor the API $commit now')).toEqual(['refactor', 'commit'])
  })

  it('ignores a name inside a word', () => {
    expect(skillTokenNames('See foo/refactor notes')).toEqual([])
  })
})

describe('invalidInsertedSkillNames', () => {
  it('keeps prompt names that the new provider cannot use', () => {
    expect(
      invalidInsertedSkillNames('Please /refactor the API', [skill({ name: 'refactor', insertable: false })]),
    ).toEqual(['refactor'])
  })

  it('does not flag a token that is still insertable or unknown', () => {
    expect(
      invalidInsertedSkillNames('Please /refactor and /unknown', [
        skill({ name: 'refactor', insertable: true }),
      ]),
    ).toEqual([])
  })
})
