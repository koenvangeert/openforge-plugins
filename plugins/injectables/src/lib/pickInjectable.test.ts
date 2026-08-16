// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('svelte', async (importOriginal) => {
  const actual = await importOriginal<typeof import('svelte')>()
  return { ...actual, mount: vi.fn(), unmount: vi.fn().mockResolvedValue(undefined) }
})

import { mount, unmount } from 'svelte'
import { pickInjectable } from './pickInjectable'

const api = {} as never

type PickerProps = {
  onSelect(injectable: { kind: string; invocationText: string }): void
  onClose(): void
  projectId: string | null
  open: boolean
}

function mountResolving(act: (props: PickerProps) => void) {
  vi.mocked(mount).mockImplementation(((_component: unknown, options: { props: PickerProps }) => {
    queueMicrotask(() => act(options.props))
    return {} as never
  }) as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  document.body.innerHTML = ''
})

describe('pickInjectable', () => {
  it('resolves with the selected injectable invocation text', async () => {
    mountResolving((props) => props.onSelect({ kind: 'snippet', invocationText: 'Verify relevance.' }))

    await expect(pickInjectable(api, 'P-1')).resolves.toBe('Verify relevance.')
  })

  it('resolves null when the picker is closed without a selection', async () => {
    mountResolving((props) => props.onClose())

    await expect(pickInjectable(api, 'P-1')).resolves.toBeNull()
  })

  it('opens the picker for the given project', async () => {
    mountResolving((props) => props.onClose())

    await pickInjectable(api, 'P-7')

    const options = vi.mocked(mount).mock.calls[0][1] as unknown as { props: PickerProps }
    expect(options.props.projectId).toBe('P-7')
    expect(options.props.open).toBe(true)
  })

  it('tears the picker down after a selection', async () => {
    mountResolving((props) => props.onSelect({ kind: 'snippet', invocationText: 'text' }))

    await pickInjectable(api, 'P-1')
    await new Promise((resolve) => queueMicrotask(() => resolve(null)))

    expect(unmount).toHaveBeenCalled()
    expect(document.querySelectorAll('[data-injectable-picker-host]')).toHaveLength(0)
  })

  it('resolves once even if the picker reports a close after a selection', async () => {
    mountResolving((props) => {
      props.onSelect({ kind: 'snippet', invocationText: 'chosen' })
      props.onClose()
    })

    await expect(pickInjectable(api, 'P-1')).resolves.toBe('chosen')
  })
})
