import type { GraphDoc, Lens, View } from '@coldtea/pr-lens-schema'

export interface ViewChoice {
  id: string
  title: string
  lens: Lens
  depth: number
}

export const WHOLE_DOCUMENT_VIEW = ''

export function viewChoices(doc: GraphDoc): ViewChoice[] {
  const choices: ViewChoice[] = []

  const walk = (views: readonly View[], depth: number): void => {
    for (const view of views) {
      choices.push({ id: view.id, title: view.title, lens: view.lens, depth })
      walk(view.children, depth + 1)
    }
  }

  walk(doc.views ?? [], 0)
  return choices
}
