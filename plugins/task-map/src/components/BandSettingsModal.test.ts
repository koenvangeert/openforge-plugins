// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'
import BandSettingsModal from './BandSettingsModal.svelte'
import { OTHER_BAND_TITLE } from '../lib/bands'

interface Overrides {
  availableLabels?: string[]
  curatedLabels?: string[]
  busy?: boolean
  error?: string | null
  onClose?: () => void
  onSave?: (labels: string[]) => void
}

function renderModal(overrides: Overrides = {}) {
  const onClose = overrides.onClose ?? vi.fn()
  const onSave = overrides.onSave ?? vi.fn()
  render(BandSettingsModal, {
    props: {
      availableLabels: overrides.availableLabels ?? ['api', 'auth'],
      curatedLabels: overrides.curatedLabels ?? [],
      busy: overrides.busy ?? false,
      error: overrides.error ?? null,
      onClose,
      onSave,
    },
  })
  return { onClose, onSave }
}

function bandRows(): string[] {
  return [...screen.getByTestId('band-settings').querySelectorAll('.band-settings-name')].map(
    (row) => row.textContent?.trim() ?? '',
  )
}

function addButton(label: string): HTMLElement {
  return screen.getByRole('button', { name: new RegExp(`^${label}$`) })
}

describe('BandSettingsModal', () => {
  it('offers every label the active Tasks carry that is not already a Band', () => {
    renderModal({ availableLabels: ['api', 'auth', 'ops'], curatedLabels: ['auth'] })

    expect(addButton('api')).toBeTruthy()
    expect(addButton('ops')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^auth$/ })).toBeNull()
  })

  it('offers nothing to add when every label already has a Band', () => {
    renderModal({ availableLabels: ['api'], curatedLabels: ['api'] })

    expect(screen.queryByText('Add a band')).toBeNull()
  })

  it('reports the set the user added', async () => {
    const { onSave } = renderModal({ availableLabels: ['api', 'auth'], curatedLabels: [] })

    await fireEvent.click(addButton('api'))
    await fireEvent.click(addButton('auth'))
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledWith(['api', 'auth'])
  })

  it('reports the set the user cut a Band from', async () => {
    const { onSave } = renderModal({ availableLabels: ['api', 'auth'], curatedLabels: ['api', 'auth'] })

    await fireEvent.click(screen.getByRole('button', { name: 'Remove the api band' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledWith(['auth'])
  })

  it('hands a structured-cloneable array to onSave', async () => {
    let received: unknown = null
    renderModal({ availableLabels: ['api'], onSave: (labels) => (received = labels) })

    await fireEvent.click(addButton('api'))
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(() => structuredClone(received)).not.toThrow()
  })

  it('reports nothing when the user cancels', async () => {
    const { onClose, onSave } = renderModal({ availableLabels: ['api'] })

    await fireEvent.click(addButton('api'))
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onSave).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('keeps a Band whose label no active Task carries, and says so', () => {
    renderModal({ availableLabels: ['api'], curatedLabels: ['ops'] })

    expect(bandRows()).toEqual(['ops', OTHER_BAND_TITLE])
    expect(screen.getByText('no active Tasks')).toBeTruthy()
  })

  it('shows the reason a save was refused', () => {
    renderModal({ error: 'the host went away' })

    expect(screen.getByRole('alert').textContent).toContain('the host went away')
  })

  it('shows no error region when there is no error', () => {
    renderModal()

    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('takes no second Save while the first one runs', () => {
    renderModal({ busy: true, curatedLabels: ['api'] })

    expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: 'Remove the api band' })).toHaveProperty(
      'disabled',
      true,
    )
  })

  it('offers no control to remove the Other Band', () => {
    renderModal({ availableLabels: ['api'], curatedLabels: ['api'] })

    expect(bandRows()).toEqual(['api', OTHER_BAND_TITLE])
    expect(screen.getByRole('button', { name: 'Remove the api band' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: `Remove the ${OTHER_BAND_TITLE} band` })).toBeNull()
  })
})
