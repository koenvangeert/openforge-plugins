import type { RenderAtlas } from '@coldtea/pr-lens-renderer'
import { findView, PrLensRenderError, render } from '@coldtea/pr-lens-renderer'
import type { GraphDoc, Lens, Theme } from '@coldtea/pr-lens-schema'
import { formatIssues, safeParseGraphDoc } from '@coldtea/pr-lens-schema'
import type { StoredDiagram } from './prLensStorage'

export interface DiagramDrawing {
  ok: true
  svg: string
  lens: Lens
  view: string | null
  width: number
  height: number
  atlas: RenderAtlas
  document: GraphDoc
}

export type DiagramRender = DiagramDrawing | { ok: false; message: string }

export interface DiagramRenderOptions {
  lens?: Lens
  theme: Theme
  view?: string
}

export function renderStoredDiagram(
  stored: StoredDiagram,
  options: DiagramRenderOptions,
): DiagramRender {
  const parsed = safeParseGraphDoc(stored.document)
  if (!parsed.ok) {
    return {
      ok: false,
      message: `This diagram no longer matches the PR Lens document format. ${formatIssues(parsed.error.issues)}`,
    }
  }

  const document = parsed.value
  const view = options.view && findView(document.views, options.view) ? options.view : undefined
  const lens = options.lens && document.lenses.includes(options.lens)
    ? options.lens
    : document.lenses[0]

  try {
    const drawn = render(document, { lens, theme: options.theme, view })
    return {
      ok: true,
      svg: drawn.svg,
      lens: drawn.lens,
      view: drawn.view ?? null,
      width: drawn.width,
      height: drawn.height,
      atlas: drawn.atlas,
      document,
    }
  } catch (error: unknown) {
    if (error instanceof PrLensRenderError) {
      return { ok: false, message: `PR Lens could not draw this diagram (${error.code}). ${error.message}` }
    }
    throw error
  }
}
