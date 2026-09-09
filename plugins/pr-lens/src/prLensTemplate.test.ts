import { describe, expect, it } from 'vitest'
import { createMockOpenForgeApi } from '@openforge-app/plugin-sdk/testing'
import { SAVE_DIAGRAM_COMMAND_ID } from './prLensCommands'
import { DEFAULT_PROMPT_TEMPLATE, loadPromptTemplate, savePromptTemplate } from './prLensTemplate'

describe('default prompt template', () => {
  it('names the command the Agent has to call', () => {
    expect(DEFAULT_PROMPT_TEMPLATE).toContain(SAVE_DIAGRAM_COMMAND_ID)
  })

  it('names the provenance fields the schema requires', () => {
    expect(DEFAULT_PROMPT_TEMPLATE).toContain('base.sha')
    expect(DEFAULT_PROMPT_TEMPLATE).toContain('head.sha')
  })

  it('does not send the Agent looking for a pull request', () => {
    expect(DEFAULT_PROMPT_TEMPLATE).not.toContain('pullRequest')
  })
})

describe('project prompt template', () => {
  it('falls back to the default for a project that never configured one', async () => {
    const api = createMockOpenForgeApi({ pluginId: 'dev.kvg.pr-lens' })

    expect(await loadPromptTemplate(api.storage, 'P-1')).toBe(DEFAULT_PROMPT_TEMPLATE)
  })

  it('returns the saved template for a project that has one', async () => {
    const api = createMockOpenForgeApi({ pluginId: 'dev.kvg.pr-lens' })

    await savePromptTemplate(api.storage, 'P-1', 'Run /pr-lens and store the result.')

    expect(await loadPromptTemplate(api.storage, 'P-1')).toBe('Run /pr-lens and store the result.')
  })

  it('restores the default when the template is cleared', async () => {
    const api = createMockOpenForgeApi({ pluginId: 'dev.kvg.pr-lens' })
    await savePromptTemplate(api.storage, 'P-1', 'Run /pr-lens.')

    expect(await savePromptTemplate(api.storage, 'P-1', '   ')).toBe(DEFAULT_PROMPT_TEMPLATE)
    expect(await loadPromptTemplate(api.storage, 'P-1')).toBe(DEFAULT_PROMPT_TEMPLATE)
  })

  it('keeps one project template out of another project', async () => {
    const api = createMockOpenForgeApi({ pluginId: 'dev.kvg.pr-lens' })

    await savePromptTemplate(api.storage, 'P-1', 'Run /pr-lens.')

    expect(await loadPromptTemplate(api.storage, 'P-2')).toBe(DEFAULT_PROMPT_TEMPLATE)
  })

  it('asks for the fields the clickable details panel and the view picker read', () => {
    expect(DEFAULT_PROMPT_TEMPLATE).toContain('subtitle')
    expect(DEFAULT_PROMPT_TEMPLATE).toContain('summary')
    expect(DEFAULT_PROMPT_TEMPLATE).toContain('files')
    expect(DEFAULT_PROMPT_TEMPLATE).toContain('views')
  })

  it('tells the agent to name the task it is storing against', () => {
    expect(DEFAULT_PROMPT_TEMPLATE).toContain('--task-id')
  })
})
