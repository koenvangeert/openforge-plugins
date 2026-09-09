// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/svelte'
import type { FrontendOpenForgeAPI } from '@openforge-app/plugin-sdk/frontend'
import { createOpenForgeRegistryFake } from '@openforge-app/plugin-sdk/testing'
import { describe, expect, it } from 'vitest'
import PrLensSettings from './PrLensSettings.svelte'
import { DEFAULT_PROMPT_TEMPLATE, TEMPLATE_STORAGE_KEY } from './prLensTemplate'

const PROJECT_ID = 'P-1'

function makeHarness() {
  const registry = createOpenForgeRegistryFake({
    pluginId: 'dev.kvg.pr-lens',
    projectId: PROJECT_ID,
  })
  const api = registry.frontendApi as FrontendOpenForgeAPI
  render(PrLensSettings, { props: { api, context: api.context.getSnapshot() } })
  return registry
}

function promptField(): HTMLTextAreaElement {
  return screen.getByLabelText('Prompt') as HTMLTextAreaElement
}

describe('PrLensSettings', () => {
  it('shows the default prompt for a project that never configured one', async () => {
    makeHarness()

    expect((await screen.findByLabelText('Prompt') as HTMLTextAreaElement).value)
      .toBe(DEFAULT_PROMPT_TEMPLATE)
  })

  it('saves an edited prompt for the project', async () => {
    const registry = makeHarness()
    await screen.findByLabelText('Prompt')

    await fireEvent.input(promptField(), { target: { value: 'Draw it my way.' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Save prompt' }))

    expect(await screen.findByText('PR Lens prompt saved.')).toBeTruthy()
    await expect(registry.storage.project(PROJECT_ID).get(TEMPLATE_STORAGE_KEY))
      .resolves.toBe('Draw it my way.')
  })

  it('restores the default when the prompt is saved blank', async () => {
    const registry = makeHarness()
    await screen.findByLabelText('Prompt')
    await fireEvent.input(promptField(), { target: { value: 'Draw it my way.' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Save prompt' }))
    await screen.findByText('PR Lens prompt saved.')

    await fireEvent.input(promptField(), { target: { value: '   ' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Save prompt' }))

    expect(await screen.findByText('Default PR Lens prompt restored.')).toBeTruthy()
    expect(promptField().value).toBe(DEFAULT_PROMPT_TEMPLATE)
    await expect(registry.storage.project(PROJECT_ID).get(TEMPLATE_STORAGE_KEY))
      .resolves.toBeNull()
  })
})
