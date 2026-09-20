import type { Injectable } from './injectableDomain'

const TOKEN = /(^|\s)[/$]([^\s]+)(?=\s|$)/g

export function skillTokenNames(prompt: string): string[] {
  const names: string[] = []
  TOKEN.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = TOKEN.exec(prompt)) !== null) {
    names.push(match[2])
  }
  return names
}

/** Skill names still in the prompt that the current catalog marks as not insertable. */
export function invalidInsertedSkillNames(prompt: string, injectables: readonly Injectable[]): string[] {
  const byName = new Map<string, Injectable>()
  for (const item of injectables) {
    if (item.kind === 'snippet') continue
    byName.set(item.name, item)
  }
  const invalid: string[] = []
  for (const name of skillTokenNames(prompt)) {
    const item = byName.get(name)
    if (item && !item.insertable && !invalid.includes(name)) invalid.push(name)
  }
  return invalid
}
