// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/svelte'
import { describe, expect, it } from 'vitest'
import SearchInput from './SearchInput.svelte'

function renderInput(overrides: Record<string, unknown> = {}) {
  return render(SearchInput, {
    props: { value: '', matchCount: 0, totalCount: 0, active: false, ...overrides },
  })
}

describe('SearchInput', () => {
  it('shows no clear button and no count when empty and inactive', () => {
    renderInput()
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull()
    expect(screen.queryByText(/of/)).toBeNull()
  })

  it('shows the clear button once there is text', () => {
    renderInput({ value: 'auth' })
    expect(screen.getByRole('button', { name: 'Clear search' })).toBeTruthy()
  })

  it('shows the match count when active', () => {
    renderInput({ value: 'auth', active: true, matchCount: 3, totalCount: 12 })
    expect(screen.getByText('3 of 12')).toBeTruthy()
  })

  it('clear button empties the input', async () => {
    renderInput({ value: 'auth' })
    await fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect((screen.getByLabelText('Search issues') as HTMLInputElement).value).toBe('')
  })

  it('typing updates the input value', async () => {
    renderInput()
    const input = screen.getByLabelText('Search issues') as HTMLInputElement
    await fireEvent.input(input, { target: { value: 'token' } })
    expect(input.value).toBe('token')
  })
})
