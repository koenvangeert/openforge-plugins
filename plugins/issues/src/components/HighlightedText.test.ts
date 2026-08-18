// @vitest-environment jsdom
import { render } from '@testing-library/svelte'
import { describe, expect, it } from 'vitest'
import HighlightedText from './HighlightedText.svelte'

describe('HighlightedText', () => {
  it('renders plain text with no <mark> when there are no terms', () => {
    const { container } = render(HighlightedText, { props: { text: 'Refresh token expiry', terms: [] } })
    expect(container.querySelector('mark')).toBeNull()
    expect(container.textContent).toBe('Refresh token expiry')
  })

  it('wraps the matched term in a <mark>, preserving the rest as plain text', () => {
    const { container } = render(HighlightedText, { props: { text: 'Refresh token expiry', terms: ['token'] } })
    const marks = container.querySelectorAll('mark')
    expect(marks).toHaveLength(1)
    expect(marks[0]!.textContent).toBe('token')
    expect(container.textContent).toBe('Refresh token expiry')
  })

  it('marks every occurrence of a multi-term match', () => {
    const { container } = render(HighlightedText, {
      props: { text: 'auth token, then auth again', terms: ['auth', 'token'] },
    })
    const marks = container.querySelectorAll('mark')
    expect(Array.from(marks).map((m) => m.textContent)).toEqual(['auth', 'token', 'auth'])
  })
})
