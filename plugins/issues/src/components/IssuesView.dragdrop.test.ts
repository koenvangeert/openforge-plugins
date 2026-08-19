// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'
import { renderIssuesView } from './IssuesView.testUtils'
import type { IssuesBoard } from '../lib/types'

const board: IssuesBoard = {
  repo: { owner: 'octo', name: 'cat' },
  issues: [
    { number: 1, title: 'Fix the thing', body: null, state: 'open', html_url: '', labels: [{ name: 'bug', color: 'ff0000' }] },
  ],
  labels: [
    { name: 'bug', color: 'ff0000' },
    { name: 'enhancement', color: '00ff00' },
  ],
  values: {},
  columnLabels: ['bug', 'enhancement'],
}

// jsdom has no real drag-and-drop DataTransfer, so drag events are dispatched as plain
// Events with a stubbed `dataTransfer`, matching the same approach as Board.test.ts.
function fakeDataTransfer() {
  return { setData: vi.fn(), getData: vi.fn(), effectAllowed: '', dropEffect: '' }
}

function dragEvent(type: string, dataTransfer: ReturnType<typeof fakeDataTransfer>): Event {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', { value: dataTransfer, configurable: true })
  return event
}

describe('IssuesView drag and drop', () => {
  it('relabels the issue on the backend when a card is dropped on another column', async () => {
    const { invoke } = renderIssuesView({
      issues_get_board: async () => board,
      issues_edit_issue: async () => null,
    })

    const cardWrapper = (await screen.findByText('Fix the thing')).closest('[draggable]') as HTMLElement
    const bugColumn = screen.getByRole('button', { name: 'Create issue in bug' }).closest('.issues-column')!
    const enhancementColumn = screen
      .getByRole('button', { name: 'Create issue in enhancement' })
      .closest('.issues-column')!
    const enhancementList = enhancementColumn.children[1] as HTMLElement

    const dt = fakeDataTransfer()
    await fireEvent(cardWrapper, dragEvent('dragstart', dt))
    await fireEvent(enhancementList, dragEvent('dragover', dt))
    await fireEvent(enhancementList, dragEvent('drop', dt))

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('issues_edit_issue', {
        projectId: 'proj-1',
        number: 1,
        addLabels: ['enhancement'],
        removeLabels: ['bug'],
      }),
    )

    // Optimistic update: the card leaves bug and shows under enhancement right away.
    const bugList = bugColumn.children[1] as HTMLElement
    expect(bugList.textContent).not.toContain('Fix the thing')
    expect(enhancementList.textContent).toContain('Fix the thing')
  })
})
