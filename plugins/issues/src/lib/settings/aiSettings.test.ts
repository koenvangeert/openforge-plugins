import { describe, expect, it, vi } from 'vitest'
import {
  ANTHROPIC_KEY_STORAGE_KEY,
  GROQ_KEY_STORAGE_KEY,
  PROVIDER_STORAGE_KEY,
  hasUsableProvider,
  keyFor,
  readAiSettings,
  resolveProvider,
  writeAnthropicKey,
  writeGroqKey,
  writePreferredProvider,
} from './aiSettings'
import type { AiSettings } from './aiSettings'

function storage(seed: Record<string, unknown> = {}, options: { failing?: boolean } = {}) {
  const values = new Map(Object.entries(seed))
  const global = {
    get: vi.fn(async (key: string) => {
      if (options.failing) throw new Error('store unavailable')
      return (values.get(key) ?? null) as never
    }),
    set: vi.fn(async (key: string, value: unknown) => void values.set(key, value)),
    delete: vi.fn(async (key: string) => void values.delete(key)),
  }
  return { api: { global, project: () => global, task: () => global }, values, global }
}

const settings = (over: Partial<AiSettings> = {}): AiSettings => ({
  anthropicKey: '',
  groqKey: '',
  preferred: 'anthropic',
  ...over,
})

describe('readAiSettings', () => {
  it('reads both keys and the preference', async () => {
    const { api } = storage({
      [ANTHROPIC_KEY_STORAGE_KEY]: 'sk-ant-1',
      [GROQ_KEY_STORAGE_KEY]: 'gsk_1',
      [PROVIDER_STORAGE_KEY]: 'groq',
    })

    expect(await readAiSettings(api as never)).toEqual({
      anthropicKey: 'sk-ant-1',
      groqKey: 'gsk_1',
      preferred: 'groq',
    })
  })

  it('reports unset keys as empty and defaults the preference', async () => {
    const { api } = storage()

    expect(await readAiSettings(api as never)).toEqual({
      anthropicKey: '',
      groqKey: '',
      preferred: 'anthropic',
    })
  })

  it('trims a pasted key and treats a whitespace-only one as absent', async () => {
    const { api } = storage({
      [ANTHROPIC_KEY_STORAGE_KEY]: '  sk-ant-1  ',
      [GROQ_KEY_STORAGE_KEY]: '   ',
    })
    const result = await readAiSettings(api as never)

    expect(result.anthropicKey).toBe('sk-ant-1')
    expect(result.groqKey).toBe('')
  })

  it('falls back to the default for a stored value that is not a provider', async () => {
    const { api } = storage({ [PROVIDER_STORAGE_KEY]: 'openai' })

    expect((await readAiSettings(api as never)).preferred).toBe('anthropic')
  })

  // Throwing here would break a settings render; from the UI's point of view an
  // unreadable store is indistinguishable from no key.
  it('treats an unreadable store as no keys rather than throwing', async () => {
    const { api } = storage({}, { failing: true })

    expect(await readAiSettings(api as never)).toEqual({
      anthropicKey: '',
      groqKey: '',
      preferred: 'anthropic',
    })
  })

  // Callers that render a board without wiring storage at all reach this: touching
  // `.global` throws synchronously, which no `.catch()` on the read would have caught.
  it('tolerates a caller with no storage at all', async () => {
    await expect(readAiSettings(undefined as never)).resolves.toEqual({
      anthropicKey: '',
      groqKey: '',
      preferred: 'anthropic',
    })
  })
})

describe('writing', () => {
  it('stores trimmed keys', async () => {
    const { api, values } = storage()

    await writeAnthropicKey(api as never, '  sk-ant-1 ')
    await writeGroqKey(api as never, ' gsk_1 ')

    expect(values.get(ANTHROPIC_KEY_STORAGE_KEY)).toBe('sk-ant-1')
    expect(values.get(GROQ_KEY_STORAGE_KEY)).toBe('gsk_1')
  })

  it('clearing a field removes the key instead of storing an empty one', async () => {
    const { api, values } = storage({ [ANTHROPIC_KEY_STORAGE_KEY]: 'sk-ant-1' })

    await writeAnthropicKey(api as never, '   ')

    expect(values.has(ANTHROPIC_KEY_STORAGE_KEY)).toBe(false)
  })

  it('persists the preference', async () => {
    const { api, values } = storage()

    await writePreferredProvider(api as never, 'groq')

    expect(values.get(PROVIDER_STORAGE_KEY)).toBe('groq')
  })
})

describe('resolveProvider', () => {
  it('honours the preference when that provider has a key', () => {
    expect(resolveProvider(settings({ anthropicKey: 'a', groqKey: 'g', preferred: 'groq' }))).toBe('groq')
    expect(resolveProvider(settings({ anthropicKey: 'a', groqKey: 'g', preferred: 'anthropic' }))).toBe('anthropic')
  })

  // The whole point of accepting two providers: having only the other one's key should
  // still give a working Refine, not an error about a setting the user never chose.
  it('uses the other provider when the preferred one has no key', () => {
    expect(resolveProvider(settings({ groqKey: 'g', preferred: 'anthropic' }))).toBe('groq')
    expect(resolveProvider(settings({ anthropicKey: 'a', preferred: 'groq' }))).toBe('anthropic')
  })

  it('resolves to nothing when neither provider has a key', () => {
    expect(resolveProvider(settings())).toBeNull()
    expect(hasUsableProvider(settings())).toBe(false)
  })

  it('reports a usable provider whenever either key is present', () => {
    expect(hasUsableProvider(settings({ groqKey: 'g' }))).toBe(true)
    expect(hasUsableProvider(settings({ anthropicKey: 'a' }))).toBe(true)
  })
})

describe('keyFor', () => {
  it('returns the key belonging to the named provider', () => {
    const both = settings({ anthropicKey: 'a', groqKey: 'g' })

    expect(keyFor(both, 'anthropic')).toBe('a')
    expect(keyFor(both, 'groq')).toBe('g')
  })
})
