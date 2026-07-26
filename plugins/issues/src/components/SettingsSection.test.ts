// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'
import SettingsSection from './SettingsSection.svelte'
import {
  ANTHROPIC_KEY_STORAGE_KEY,
  GROQ_KEY_STORAGE_KEY,
  PROVIDER_STORAGE_KEY,
} from '../lib/settings/aiSettings'

/** Renders the section over a key-aware fake store. */
function renderSection(stored: Record<string, unknown> = {}, overrides: { set?: ReturnType<typeof vi.fn> } = {}) {
  const get = vi.fn(async (key: string) => stored[key] ?? null)
  const set = overrides.set ?? vi.fn()
  const del = vi.fn()
  const api = { storage: { global: { get, set, delete: del } } }
  render(SettingsSection, { props: { api, context: {} } as never })
  return { get, set, del }
}

/**
 * The controls stay disabled until the stored settings land, so awaiting enablement is
 * both the load signal and the state a user could actually interact with.
 */
async function readyField(label: RegExp): Promise<HTMLInputElement> {
  const field = (await screen.findByLabelText(label)) as HTMLInputElement
  await waitFor(() => expect(field.disabled).toBe(false))
  return field
}

const anthropicField = () => readyField(/Anthropic API key/i)
const groqField = () => readyField(/Groq API key/i)
const providerRadio = (label: RegExp) => readyField(label)

describe('SettingsSection', () => {
  it('shows each existing key against its own provider', async () => {
    renderSection({ [ANTHROPIC_KEY_STORAGE_KEY]: 'sk-ant-stored', [GROQ_KEY_STORAGE_KEY]: 'gsk-stored' })

    await waitFor(async () => {
      expect(((await anthropicField()) as HTMLInputElement).value).toBe('sk-ant-stored')
      expect(((await groqField()) as HTMLInputElement).value).toBe('gsk-stored')
    })
  })

  it('starts empty when nothing is stored', async () => {
    renderSection()

    await waitFor(async () => {
      expect(((await anthropicField()) as HTMLInputElement).value).toBe('')
      expect(((await groqField()) as HTMLInputElement).value).toBe('')
    })
  })

  it('saves each key under its own storage key', async () => {
    const { set } = renderSection()

    await fireEvent.input(await anthropicField(), { target: { value: 'sk-ant-new' } })
    await fireEvent.blur(await anthropicField())
    await waitFor(() => expect(set).toHaveBeenCalledWith(ANTHROPIC_KEY_STORAGE_KEY, 'sk-ant-new'))

    await fireEvent.input(await groqField(), { target: { value: 'gsk-new' } })
    await fireEvent.blur(await groqField())
    await waitFor(() => expect(set).toHaveBeenCalledWith(GROQ_KEY_STORAGE_KEY, 'gsk-new'))
  })

  it('removes a key when its field is cleared, which can re-gate Refine', async () => {
    const { set, del } = renderSection({ [ANTHROPIC_KEY_STORAGE_KEY]: 'sk-ant-stored' })
    const input = await anthropicField()

    await fireEvent.input(input, { target: { value: '' } })
    await fireEvent.blur(input)

    await waitFor(() => expect(del).toHaveBeenCalledWith(ANTHROPIC_KEY_STORAGE_KEY))
    expect(set).not.toHaveBeenCalled()
  })

  it('does not write when a key is unchanged', async () => {
    const { set, del } = renderSection({ [ANTHROPIC_KEY_STORAGE_KEY]: 'sk-ant-stored' })

    await fireEvent.blur(await anthropicField())

    await waitFor(() => expect(screen.getByDisplayValue('sk-ant-stored')).toBeTruthy())
    expect(set).not.toHaveBeenCalled()
    expect(del).not.toHaveBeenCalled()
  })

  it('masks both keys rather than showing them in the clear', async () => {
    renderSection({ [ANTHROPIC_KEY_STORAGE_KEY]: 'sk-ant-stored', [GROQ_KEY_STORAGE_KEY]: 'gsk-stored' })

    expect(((await anthropicField()) as HTMLInputElement).type).toBe('password')
    expect(((await groqField()) as HTMLInputElement).type).toBe('password')
  })

  it('persists the provider choice', async () => {
    const { set } = renderSection({ [PROVIDER_STORAGE_KEY]: 'anthropic' })

    await fireEvent.change(await providerRadio(/^Groq$/i))

    await waitFor(() => expect(set).toHaveBeenCalledWith(PROVIDER_STORAGE_KEY, 'groq'))
  })

  it('reflects the stored choice on load', async () => {
    renderSection({ [PROVIDER_STORAGE_KEY]: 'groq' })

    await waitFor(async () => {
      expect(((await providerRadio(/^Groq$/i))).checked).toBe(true)
    })
  })

  // A preference that cannot be honoured is the confusing case: say which provider is
  // actually running rather than letting the user assume their choice took effect.
  it('warns when the preferred provider has no key and the other one is running', async () => {
    renderSection({ [GROQ_KEY_STORAGE_KEY]: 'gsk-stored', [PROVIDER_STORAGE_KEY]: 'anthropic' })

    await waitFor(() => expect(screen.getByText(/Using Groq instead/i)).toBeTruthy())
  })

  it('says the choice is inert while no key is configured', async () => {
    renderSection()

    await waitFor(() => expect(screen.getByText(/Add a key above to enable Refine/i)).toBeTruthy())
  })

  it('surfaces a save failure instead of silently dropping the key', async () => {
    const set = vi.fn().mockRejectedValue(new Error('store is read-only'))
    renderSection({}, { set })
    const input = await anthropicField()

    await fireEvent.input(input, { target: { value: 'sk-ant-new' } })
    await fireEvent.blur(input)

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('store is read-only'))
  })
})
