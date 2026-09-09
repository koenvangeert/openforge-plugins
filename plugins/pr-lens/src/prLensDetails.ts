import type { GraphDoc } from '@coldtea/pr-lens-schema'
import type { DiagramTarget } from './prLensHitTest'

export interface DiagramDetail {
  kind: DiagramTarget['kind']
  title: string
  subtitle: string | null
  /** What the reader needs to place it: a lane for a node, the two ends for an edge. */
  context: string | null
  badges: string[]
  delta: string | null
  summary: string | null
  files: string[]
}

function fileLabel(file: { path: string; startLine?: number; endLine?: number }): string {
  if (file.startLine === undefined) return file.path
  const end = file.endLine !== undefined && file.endLine !== file.startLine ? `-${file.endLine}` : ''
  return `${file.path}:${file.startLine}${end}`
}

export function diagramDetail(doc: GraphDoc, target: DiagramTarget): DiagramDetail | null {
  const laneLabel = (id: string): string => doc.lanes.find((lane) => lane.id === id)?.label ?? id
  const nodeLabel = (id: string): string => doc.nodes.find((node) => node.id === id)?.label ?? id

  if (target.kind === 'node') {
    const node = doc.nodes.find((candidate) => candidate.id === target.id)
    if (!node) return null
    return {
      kind: 'node',
      title: node.label,
      subtitle: node.subtitle ?? null,
      context: laneLabel(node.lane),
      badges: [node.kind, ...(node.badges ?? [])],
      delta: node.delta,
      summary: node.summary ?? null,
      files: (node.files ?? []).map(fileLabel),
    }
  }

  if (target.kind === 'edge') {
    const edge = doc.edges.find((candidate) => candidate.id === target.id)
    if (!edge) return null
    return {
      kind: 'edge',
      title: edge.label ?? `${nodeLabel(edge.from)} to ${nodeLabel(edge.to)}`,
      subtitle: null,
      context: `${nodeLabel(edge.from)} to ${nodeLabel(edge.to)}`,
      badges: [edge.kind],
      delta: edge.delta,
      summary: edge.summary ?? null,
      files: (edge.files ?? []).map(fileLabel),
    }
  }

  const lane = doc.lanes.find((candidate) => candidate.id === target.id)
  if (!lane) return null
  const members = doc.nodes.filter((node) => node.lane === lane.id).length
  return {
    kind: 'lane',
    title: lane.label,
    subtitle: lane.subtitle ?? null,
    context: `${members} ${members === 1 ? 'node' : 'nodes'}`,
    badges: [],
    delta: lane.delta ?? null,
    summary: lane.summary ?? null,
    files: [],
  }
}
