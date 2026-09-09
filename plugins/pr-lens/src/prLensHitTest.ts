import type { Box, RenderAtlas } from '@coldtea/pr-lens-renderer'

export type DiagramTargetKind = 'node' | 'edge' | 'lane'

export interface DiagramTarget {
  kind: DiagramTargetKind
  id: string
}

export interface DiagramPoint {
  x: number
  y: number
}

const PRECEDENCE: DiagramTargetKind[] = ['node', 'edge', 'lane']

function contains(box: Box, point: DiagramPoint): boolean {
  return point.x >= box.x
    && point.x <= box.x + box.width
    && point.y >= box.y
    && point.y <= box.y + box.height
}

function area(box: Box): number {
  return box.width * box.height
}

export function hitTestDiagram(atlas: RenderAtlas, point: DiagramPoint): DiagramTarget | null {
  const boxes: Record<DiagramTargetKind, Record<string, Box>> = {
    node: atlas.nodes,
    edge: atlas.edges,
    lane: atlas.lanes,
  }

  for (const kind of PRECEDENCE) {
    let hit: { id: string; box: Box } | null = null
    for (const [id, box] of Object.entries(boxes[kind])) {
      if (!contains(box, point)) continue
      if (!hit || area(box) < area(hit.box)) hit = { id, box }
    }
    if (hit) return { kind, id: hit.id }
  }

  return null
}
