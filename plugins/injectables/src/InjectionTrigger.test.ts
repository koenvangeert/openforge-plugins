// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'

// The picker (Task 5) is already thoroughly tested on its own; mocking the whole
// child component keeps this suite focused on InjectionTrigger's own responsibility
// (open/close + onInsert wiring) instead of re-exercising the picker's internals.
vi.mock('./InjectablePicker.svelte', async () => ({
  default: (await import('./test/InjectablePickerTestDouble.svelte')).default,
}))

import InjectionTrigger from './InjectionTrigger.svelte'
import { receivedPickerProps } from './test/injectablePickerTestDoubleState'

function renderTrigger(onInsert = vi.fn(), api: unknown = {}, projectId: string | null = 'P-1') {
  render(InjectionTrigger, {
    props: {
      api,
      context: {},
      location: 'createTaskPrompt',
      projectId,
      taskId: null,
      onInsert,
    } as never,
  })
  return onInsert
}

describe('InjectionTrigger', () => {
  it('renders a trigger control with the picker initially closed', () => {
    renderTrigger()

    expect(screen.getByTestId('injection-trigger')).toBeTruthy()
    expect(screen.queryByTestId('picker-select')).toBeNull()
  })

  it('opens the picker when the trigger is activated', async () => {
    renderTrigger()

    await fireEvent.click(screen.getByTestId('injection-trigger'))

    expect(screen.getByTestId('picker-select')).toBeTruthy()
  })

  it('forwards its api and projectId props through to the picker', async () => {
    const api = { marker: 'trigger-api' }
    renderTrigger(vi.fn(), api, 'P-7')

    await fireEvent.click(screen.getByTestId('injection-trigger'))

    expect(receivedPickerProps.api).toBe(api)
    expect(receivedPickerProps.projectId).toBe('P-7')
  })

  it('inserts the selected injectable text and closes the picker', async () => {
    const onInsert = renderTrigger()

    await fireEvent.click(screen.getByTestId('injection-trigger'))
    await fireEvent.click(screen.getByTestId('picker-select'))

    expect(onInsert).toHaveBeenCalledTimes(1)
    expect(onInsert).toHaveBeenCalledWith('INSERTED')
    expect(screen.queryByTestId('picker-select')).toBeNull()
  })

  it('closes the picker without inserting when dismissed', async () => {
    const onInsert = renderTrigger()

    await fireEvent.click(screen.getByTestId('injection-trigger'))
    await fireEvent.click(screen.getByTestId('picker-close'))

    expect(onInsert).not.toHaveBeenCalled()
    expect(screen.queryByTestId('picker-select')).toBeNull()
  })
})
