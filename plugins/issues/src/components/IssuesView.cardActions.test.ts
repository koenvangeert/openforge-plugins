// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'
import { renderIssuesView } from './IssuesView.testUtils'
import type { IssuesBoard } from '../lib/types'

const board: IssuesBoard = {
  repo: { owner: 'octo', name: 'cat' },
  issues: [
    {
      number: 7,
      title: 'Fix the door',
      body: '',
      state: 'open',
      html_url: 'https://github.com/octo/cat/issues/7',
      labels: [{ name: 'bug', color: 'd73a4a' }],
    },
  ],
  labels: [{ name: 'bug', color: 'd73a4a' }],
  values: {},
  columnLabels: ['bug'],
}

describe('IssuesView card actions', () => {
  it('copies the issue link and does not open the browser', async () => {
    const { api } = renderIssuesView({ issues_get_board: async () => board })

    await screen.findByText('Fix the door')
    await fireEvent.click(screen.getByRole('button', { name: 'Copy issue link' }))

    expect(api.system.writeClipboardText).toHaveBeenCalledWith('https://github.com/octo/cat/issues/7')
    expect(api.system.openUrl).not.toHaveBeenCalled()
  })

  it('keeps the browser closed when the clipboard write fails', async () => {
    const { api } = renderIssuesView({ issues_get_board: async () => board })
    vi.mocked(api.system.writeClipboardText).mockRejectedValueOnce(new Error('clipboard denied'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await screen.findByText('Fix the door')
    await fireEvent.click(screen.getByRole('button', { name: 'Copy issue link' }))

    expect(api.system.openUrl).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('opens the issue in the browser from the open control', async () => {
    const { api } = renderIssuesView({ issues_get_board: async () => board })

    await screen.findByText('Fix the door')
    await fireEvent.click(screen.getByRole('button', { name: 'Open issue on GitHub' }))

    expect(api.system.openUrl).toHaveBeenCalledWith('https://github.com/octo/cat/issues/7')
    expect(api.system.writeClipboardText).not.toHaveBeenCalled()
  })
})
