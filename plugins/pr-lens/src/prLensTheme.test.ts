// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { observeDiagramTheme, resolveDiagramTheme } from './prLensTheme'

function setAppearance(value: string | null): void {
  if (value === null) document.documentElement.removeAttribute('data-theme-appearance')
  else document.documentElement.setAttribute('data-theme-appearance', value)
}

function stubPrefersDark(matches: boolean): void {
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })))
}

afterEach(() => {
  setAppearance(null)
  vi.unstubAllGlobals()
})

describe('resolveDiagramTheme', () => {
  it("follows the host's declared appearance", () => {
    setAppearance('dark')
    expect(resolveDiagramTheme()).toBe('dark')

    setAppearance('light')
    expect(resolveDiagramTheme()).toBe('light')
  })

  it('falls back to the system preference when the host declares nothing', () => {
    stubPrefersDark(true)
    expect(resolveDiagramTheme()).toBe('dark')

    stubPrefersDark(false)
    expect(resolveDiagramTheme()).toBe('light')
  })
})

describe('observeDiagramTheme', () => {
  it('reports each appearance switch once and stops after disposal', async () => {
    stubPrefersDark(false)
    const seen: string[] = []
    const stop = observeDiagramTheme((theme) => seen.push(theme))

    setAppearance('dark')
    await new Promise((resolve) => setTimeout(resolve, 0))
    setAppearance('dark')
    await new Promise((resolve) => setTimeout(resolve, 0))
    stop()
    setAppearance('light')
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(seen).toEqual(['dark'])
  })
})
