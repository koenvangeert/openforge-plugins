// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import type { FrontendOpenForgeAPI } from '@openforge-app/plugin-sdk/frontend'
import { createMemoryPluginStorage } from '@openforge-app/plugin-sdk/testing'
import {
  DEFAULT_INTAKE_TEMPLATE,
  readIntakeTemplate,
  renderIntakeTemplate,
  saveIntakeTemplate,
  validateIntakeTemplate,
} from './intakeTemplate'
import { PROJECT_KEY } from './protocol'

type Api = Pick<FrontendOpenForgeAPI, 'storage'>

const ISSUE = {
  key: ' proj-7 ',
  summary: ' Fix Issue Intake ',
  descriptionHtml: '<p>Keep the <strong>description</strong>.</p><script>discard()</script>',
}

describe('renderIntakeTemplate', () => {
  it('reproduces the legacy heading-and-description prompt with the default template', () => {
    expect(renderIntakeTemplate(DEFAULT_INTAKE_TEMPLATE, ISSUE)).toBe(
      'PROJ-7: Fix Issue Intake\n\n<p>Keep the <strong>description</strong>.</p>',
    )
  })

  it('trims a dangling placeholder to nothing when the description is empty', () => {
    expect(renderIntakeTemplate(DEFAULT_INTAKE_TEMPLATE, { ...ISSUE, descriptionHtml: '   ' })).toBe(
      'PROJ-7: Fix Issue Intake',
    )
  })

  it('lets the template arrange the Intake Context fields in any order', () => {
    expect(renderIntakeTemplate('{{description}}\n\n--\n{{summary}} ({{key}})', ISSUE)).toBe(
      '<p>Keep the <strong>description</strong>.</p>\n\n--\nFix Issue Intake (PROJ-7)',
    )
  })

  it('substitutes placeholders case-insensitively and tolerates inner whitespace', () => {
    expect(renderIntakeTemplate('{{ KEY }}/{{Summary}}', ISSUE)).toBe('PROJ-7/Fix Issue Intake')
  })

  it('normalizes the key, trims the summary, and sanitizes the description', () => {
    const rendered = renderIntakeTemplate('{{key}}|{{summary}}|{{description}}', ISSUE)
    expect(rendered).toBe('PROJ-7|Fix Issue Intake|<p>Keep the <strong>description</strong>.</p>')
  })

  it('repeats a placeholder wherever it appears', () => {
    expect(renderIntakeTemplate('{{key}} {{key}}', ISSUE)).toBe('PROJ-7 PROJ-7')
  })
})

describe('validateIntakeTemplate', () => {
  it('accepts a template that only references known placeholders and returns it trimmed', () => {
    expect(validateIntakeTemplate('  {{key}}: {{summary}}  ')).toEqual({
      ok: true,
      template: '{{key}}: {{summary}}',
    })
  })

  it('rejects a blank template', () => {
    expect(validateIntakeTemplate('   ')).toEqual({ ok: false, message: expect.stringMatching(/must not be empty/i) })
  })

  it('rejects an unknown placeholder and names the supported ones', () => {
    const result = validateIntakeTemplate('{{key}} {{status}}')
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected invalid')
    expect(result.message).toContain('{{status}}')
    expect(result.message).toContain('{{key}}')
    expect(result.message).toContain('{{summary}}')
    expect(result.message).toContain('{{description}}')
  })
})

describe('readIntakeTemplate', () => {
  it('initializes the default template in the owning Project only', async () => {
    const storage = createMemoryPluginStorage()

    const result = await readIntakeTemplate({ storage } satisfies Api, 'P-1')

    expect(result).toBe(DEFAULT_INTAKE_TEMPLATE)
    await expect(storage.project('P-1').get(PROJECT_KEY.intakeTemplate)).resolves.toEqual({
      template: DEFAULT_INTAKE_TEMPLATE,
    })
    await expect(storage.project('P-2').get(PROJECT_KEY.intakeTemplate)).resolves.toBeNull()
    await expect(storage.global.get(PROJECT_KEY.intakeTemplate)).resolves.toBeNull()
  })

  it('returns the persisted template for the Project', async () => {
    const storage = createMemoryPluginStorage()
    await storage.project('P-1').set(PROJECT_KEY.intakeTemplate, { template: '{{summary}} — {{key}}' })

    await expect(readIntakeTemplate({ storage } satisfies Api, 'P-1')).resolves.toBe('{{summary}} — {{key}}')
  })

  it('repairs a blank stored template to the default', async () => {
    const storage = createMemoryPluginStorage()
    await storage.project('P-1').set(PROJECT_KEY.intakeTemplate, { template: '   ' })

    await expect(readIntakeTemplate({ storage } satisfies Api, 'P-1')).resolves.toBe(DEFAULT_INTAKE_TEMPLATE)
    await expect(storage.project('P-1').get(PROJECT_KEY.intakeTemplate)).resolves.toEqual({
      template: DEFAULT_INTAKE_TEMPLATE,
    })
  })

  it('repairs a stored template that references an unknown placeholder', async () => {
    const storage = createMemoryPluginStorage()
    await storage.project('P-1').set(PROJECT_KEY.intakeTemplate, { template: '{{key}} {{assignee}}' })

    await expect(readIntakeTemplate({ storage } satisfies Api, 'P-1')).resolves.toBe(DEFAULT_INTAKE_TEMPLATE)
  })
})

describe('saveIntakeTemplate', () => {
  it('persists a trimmed template for the Project', async () => {
    const storage = createMemoryPluginStorage()
    const api = { storage } satisfies Api

    await expect(saveIntakeTemplate(api, 'P-1', '  {{key}}\n\n{{description}}  ')).resolves.toBe(
      '{{key}}\n\n{{description}}',
    )
    await expect(storage.project('P-1').get(PROJECT_KEY.intakeTemplate)).resolves.toEqual({
      template: '{{key}}\n\n{{description}}',
    })
  })

  it('rejects a blank template so the workspace never loses its template', async () => {
    const storage = createMemoryPluginStorage()

    await expect(saveIntakeTemplate({ storage } satisfies Api, 'P-1', '   ')).rejects.toThrow(/must not be empty/i)
  })

  it('rejects a template with an unknown placeholder', async () => {
    const storage = createMemoryPluginStorage()

    await expect(saveIntakeTemplate({ storage } satisfies Api, 'P-1', '{{key}} {{status}}')).rejects.toThrow(
      /\{\{status\}\}/,
    )
  })
})
