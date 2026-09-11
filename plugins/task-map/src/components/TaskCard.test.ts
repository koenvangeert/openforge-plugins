// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'
import TaskCard from './TaskCard.svelte'
import type { MapCard } from '../lib/cards'

function card(overrides: Partial<MapCard> = {}): MapCard {
  return { taskId: 'T-1', label: 'Rotate the tokens', status: 'backlog', x: 24, y: 48, ...overrides }
}

describe('TaskCard', () => {
  it('shows the Task title', () => {
    render(TaskCard, { props: { card: card(), onOpen: vi.fn() } })

    expect(screen.getByRole('button', { name: /Rotate the tokens/ })).toBeTruthy()
  })

  it('shows the Task id when the title is empty', () => {
    render(TaskCard, { props: { card: card({ label: 'T-9' }), onOpen: vi.fn() } })

    expect(screen.getByRole('button', { name: /T-9/ })).toBeTruthy()
  })

  it('marks a backlog Task', () => {
    render(TaskCard, { props: { card: card({ status: 'backlog' }), onOpen: vi.fn() } })

    const button = screen.getByRole('button', { name: /Rotate the tokens/ })
    expect(button.dataset.status).toBe('backlog')
    expect(button.textContent).toContain('Backlog')
  })

  it('marks a doing Task', () => {
    render(TaskCard, { props: { card: card({ status: 'doing' }), onOpen: vi.fn() } })

    const button = screen.getByRole('button', { name: /Rotate the tokens/ })
    expect(button.dataset.status).toBe('doing')
    expect(button.textContent).toContain('Doing')
  })

  it('positions itself at its placed coordinates', () => {
    render(TaskCard, { props: { card: card({ x: 120, y: 240 }), onOpen: vi.fn() } })

    const button = screen.getByRole('button', { name: /Rotate the tokens/ })
    expect(button.style.left).toBe('120px')
    expect(button.style.top).toBe('240px')
  })

  it('reports its Task id on click', async () => {
    const onOpen = vi.fn()
    render(TaskCard, { props: { card: card({ taskId: 'T-42' }), onOpen } })

    await fireEvent.click(screen.getByRole('button', { name: /Rotate the tokens/ }))

    expect(onOpen).toHaveBeenCalledWith('T-42')
  })

  it('offers no dependency control', () => {
    render(TaskCard, { props: { card: card(), onOpen: vi.fn() } })

    expect(screen.getAllByRole('button')).toHaveLength(1)
  })
})
