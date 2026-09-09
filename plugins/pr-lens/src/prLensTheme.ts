import type { Theme } from '@coldtea/pr-lens-renderer'

const APPEARANCE_ATTRIBUTE = 'data-theme-appearance'
const DARK_QUERY = '(prefers-color-scheme: dark)'

export function resolveDiagramTheme(doc: Document = document): Theme {
  const declared = doc.documentElement.getAttribute(APPEARANCE_ATTRIBUTE)
  if (declared === 'dark' || declared === 'light') return declared
  return doc.defaultView?.matchMedia?.(DARK_QUERY).matches ? 'dark' : 'light'
}

export function observeDiagramTheme(
  onChange: (theme: Theme) => void,
  doc: Document = document,
): () => void {
  let current = resolveDiagramTheme(doc)
  const settle = (): void => {
    const next = resolveDiagramTheme(doc)
    if (next === current) return
    current = next
    onChange(next)
  }

  const observer = new MutationObserver(settle)
  observer.observe(doc.documentElement, { attributeFilter: [APPEARANCE_ATTRIBUTE] })

  const media = doc.defaultView?.matchMedia?.(DARK_QUERY)
  media?.addEventListener('change', settle)

  return () => {
    observer.disconnect()
    media?.removeEventListener('change', settle)
  }
}
