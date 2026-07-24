// @vitest-environment jsdom
import { createEvent, fireEvent, render, screen } from '@testing-library/svelte'
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

  describe('Cmd+I shortcut', () => {
    it('opens the picker from anywhere on the surface', async () => {
      renderTrigger()

      await fireEvent.keyDown(document, { key: 'i', metaKey: true })

      expect(screen.getByTestId('picker-select')).toBeTruthy()
    })

    it('fires while a prompt field has focus, which is the point of it', async () => {
      renderTrigger()
      const field = document.createElement('textarea')
      document.body.appendChild(field)
      field.focus()

      await fireEvent.keyDown(field, { key: 'i', metaKey: true })

      expect(screen.getByTestId('picker-select')).toBeTruthy()
      field.remove()
    })

    it('ignores the key without the meta modifier', async () => {
      renderTrigger()

      await fireEvent.keyDown(document, { key: 'i' })

      expect(screen.queryByTestId('picker-select')).toBeNull()
    })

    it('does nothing while the picker is already open', async () => {
      renderTrigger()

      await fireEvent.click(screen.getByTestId('injection-trigger'))
      await fireEvent.keyDown(document, { key: 'i', metaKey: true })

      // Still exactly one picker, not a second stacked on top.
      expect(screen.getAllByTestId('picker-select')).toHaveLength(1)
    })

    it('stops listening once unmounted', async () => {
      const { unmount } = render(InjectionTrigger, {
        props: {
          api: {}, context: {}, location: 'createTaskPrompt', projectId: 'P-1', taskId: null,
          onInsert: vi.fn(),
        } as never,
      })
      unmount()

      await fireEvent.keyDown(document, { key: 'i', metaKey: true })

      expect(screen.queryByTestId('picker-select')).toBeNull()
    })

    it('restores focus to the field that was focused when it opened, after inserting', async () => {
      // A running session inserts into the terminal but never refocuses it (the host's
      // agentSession onInsert only writes to the PTY), and the picker's Modal restores
      // no focus on close. Without the trigger handing focus back, the terminal keeps
      // the inserted text but loses the keyboard. A textarea stands in for the terminal.
      renderTrigger()
      const terminal = document.createElement('textarea')
      document.body.appendChild(terminal)
      terminal.focus()

      await fireEvent.keyDown(terminal, { key: 'i', metaKey: true })
      // The real picker's Modal pulls focus onto itself on open; mimic that so the test
      // exercises focus restoration rather than focus merely never having moved.
      screen.getByTestId('picker-select').focus()

      await fireEvent.click(screen.getByTestId('picker-select'))

      expect(document.activeElement).toBe(terminal)
      terminal.remove()
    })

    it('restores focus to the field even when opened by clicking the trigger button', async () => {
      // The reported failure: opening by clicking the ✨ trigger (not ⌘I) let the button
      // take focus, so focus returned to the button after inserting instead of the
      // terminal. The trigger must decline the mousedown focus so the field the user
      // came from — a running session's terminal — stays the restore target.
      renderTrigger()
      const terminal = document.createElement('textarea')
      document.body.appendChild(terminal)
      terminal.focus()

      const button = screen.getByTestId('injection-trigger')
      // Emulate the browser: a button takes focus on mousedown unless it is prevented.
      const mousedown = createEvent.mouseDown(button)
      await fireEvent(button, mousedown)
      if (!mousedown.defaultPrevented) button.focus()

      await fireEvent.click(button)
      screen.getByTestId('picker-select').focus()
      await fireEvent.click(screen.getByTestId('picker-select'))

      expect(document.activeElement).toBe(terminal)
      terminal.remove()
    })

    it('restores focus to the field that was focused when it opened, after dismissing', async () => {
      renderTrigger()
      const terminal = document.createElement('textarea')
      document.body.appendChild(terminal)
      terminal.focus()

      await fireEvent.keyDown(terminal, { key: 'i', metaKey: true })
      screen.getByTestId('picker-close').focus()

      await fireEvent.click(screen.getByTestId('picker-close'))

      expect(document.activeElement).toBe(terminal)
      terminal.remove()
    })

    it('lets the dialog trigger win while a dialog is open, not the session one', async () => {
      // Both surfaces can be mounted at once — a task's session behind the create-task
      // dialog. Only the dialog's trigger may answer, or one keypress opens two pickers.
      const dialog = document.createElement('div')
      dialog.setAttribute('role', 'dialog')
      document.body.appendChild(dialog)

      render(InjectionTrigger, {
        props: {
          api: {}, context: {}, location: 'agentSession', projectId: 'P-1', taskId: 'T-1',
          onInsert: vi.fn(),
        } as never,
      })
      render(InjectionTrigger, {
        props: {
          api: {}, context: {}, location: 'createTaskPrompt', projectId: 'P-1', taskId: null,
          onInsert: vi.fn(),
        } as never,
        target: dialog,
      })

      const field = document.createElement('textarea')
      dialog.appendChild(field)
      field.focus()
      await fireEvent.keyDown(field, { key: 'i', metaKey: true })

      expect(screen.getAllByTestId('picker-select')).toHaveLength(1)
      dialog.remove()
    })
  })
})
