import { SCHEMA_VERSION } from '@coldtea/pr-lens-schema'

export const BASE_SHA = 'a'.repeat(40)
export const HEAD_SHA = 'b'.repeat(40)

export function validGraphDocInput(): Record<string, unknown> {
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: 'graph',
    title: 'Add the PR Lens task tab',
    lenses: ['architecture'],
    provenance: {
      repo: { owner: 'acme', name: 'app' },
      base: { sha: BASE_SHA, ref: 'main' },
      head: { sha: HEAD_SHA, ref: 'add-pr-lens' },
    },
    lanes: [{ id: 'ui', label: 'Interface' }],
    nodes: [
      { id: 'tab', lane: 'ui', label: 'PR Lens tab', kind: 'ui', delta: 'added' },
      { id: 'store', lane: 'ui', label: 'Task storage', kind: 'datastore', delta: 'modified' },
    ],
    edges: [{ id: 'e1', from: 'tab', to: 'store', kind: 'data', delta: 'added' }],
  }
}

export function twoLensGraphDocInput(): Record<string, unknown> {
  return {
    ...validGraphDocInput(),
    lenses: ['architecture', 'data-flow'],
    flows: [{
      id: 'save',
      title: 'Saving a diagram',
      participants: [{ node: 'tab' }, { node: 'store' }],
      messages: [{ id: 'm1', from: 'tab', to: 'store', label: 'save', delta: 'added' }],
    }],
  }
}

export function schemaInvalidGraphDocInput(): Record<string, unknown> {
  const doc = validGraphDocInput()
  delete doc.provenance
  return doc
}

export function danglingReferenceGraphDocInput(): Record<string, unknown> {
  const doc = validGraphDocInput()
  doc.edges = [{ id: 'e1', from: 'tab', to: 'absent', kind: 'data', delta: 'added' }]
  return doc
}

export function undrawableGraphDocInput(): Record<string, unknown> {
  return { ...validGraphDocInput(), lenses: ['data-flow'] }
}

export function viewTreeGraphDocInput(): Record<string, unknown> {
  return {
    ...validGraphDocInput(),
    views: [{
      id: 'interface',
      title: 'Interface',
      lens: 'architecture',
      scope: { kind: 'selection', nodes: ['tab', 'store'] },
      children: [{
        id: 'interface-tab',
        title: 'The tab itself',
        lens: 'architecture',
        scope: { kind: 'selection', nodes: ['tab'] },
      }],
    }],
  }
}

export function detailedGraphDocInput(): Record<string, unknown> {
  const doc = validGraphDocInput()
  doc.nodes = [
    {
      id: 'tab',
      lane: 'ui',
      label: 'PR Lens tab',
      kind: 'ui',
      delta: 'added',
      subtitle: 'PrLensTaskPane.svelte',
      summary: 'Draws the stored document and offers the request control.',
      badges: ['new'],
      files: [{ path: 'src/PrLensTaskPane.svelte', startLine: 1, endLine: 40 }],
    },
    { id: 'store', lane: 'ui', label: 'Task storage', kind: 'datastore', delta: 'modified' },
  ]
  doc.edges = [{
    id: 'e1',
    from: 'tab',
    to: 'store',
    kind: 'data',
    delta: 'added',
    summary: 'Reads the task-scoped document.',
  }]
  return doc
}
