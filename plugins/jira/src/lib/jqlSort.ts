export type SortDirection = 'asc' | 'desc'

interface OrderClause {
  query: string
  terms: string[]
}

function findOrderBy(jql: string): { start: number; end: number } | null {
  let quote: '"' | "'" | null = null
  let escaped = false

  for (let index = 0; index < jql.length; index += 1) {
    const character = jql[index]
    if (quote) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === quote) quote = null
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      continue
    }
    if (index > 0 && !/\s/.test(jql[index - 1])) continue
    const match = jql.slice(index).match(/^order\s+by\b/i)
    if (match) return { start: index, end: index + match[0].length }
  }
  return null
}

function splitTerms(clause: string): string[] {
  const terms: string[] = []
  let start = 0
  let quote: '"' | "'" | null = null
  let escaped = false
  let depth = 0

  for (let index = 0; index < clause.length; index += 1) {
    const character = clause[index]
    if (quote) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === quote) quote = null
      continue
    }
    if (character === '"' || character === "'") quote = character
    else if ('([{'.includes(character)) depth += 1
    else if (')]}'.includes(character)) depth = Math.max(0, depth - 1)
    else if (character === ',' && depth === 0) {
      terms.push(clause.slice(start, index).trim())
      start = index + 1
    }
  }
  terms.push(clause.slice(start).trim())
  return terms.filter(Boolean)
}

function readOrderClause(jql: string): OrderClause {
  const trimmed = jql.trim()
  const orderBy = findOrderBy(trimmed)
  if (!orderBy) return { query: trimmed, terms: [] }
  return {
    query: trimmed.slice(0, orderBy.start).trim(),
    terms: splitTerms(trimmed.slice(orderBy.end).trim()),
  }
}

function statusTermDirection(term: string): SortDirection | null {
  const match = term.match(/^(?:status|"status")(?:\s+(asc|desc))?$/i)
  if (!match) return null
  return match[1]?.toLowerCase() === 'desc' ? 'desc' : 'asc'
}

export function getStatusSortDirection(jql: string): SortDirection | null {
  const firstTerm = readOrderClause(jql).terms[0]
  return firstTerm ? statusTermDirection(firstTerm) : null
}

export function withStatusSort(jql: string, direction: SortDirection): string {
  const { query, terms } = readOrderClause(jql)
  const secondaryTerms = terms.filter((term) => statusTermDirection(term) === null)
  const orderTerms = [`status ${direction.toUpperCase()}`, ...secondaryTerms]
  return `${query} ORDER BY ${orderTerms.join(', ')}`
}
