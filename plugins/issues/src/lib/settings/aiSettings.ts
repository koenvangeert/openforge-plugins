// The API keys powering Refine, kept in plugin-global storage, and which provider to
// spend them on.
//
// The settings section writes these and the backend reads them, so the storage keys and
// the empty/absent rules live here rather than being restated at both ends: the dialog
// gates Refine on "is there a usable provider", and that answer has to match what the
// backend will actually find when it goes to call an API.
//
// NOTE: plugin storage is not encrypted at rest — keys land in the app's SQLite database
// as plain text. The SDK exposes no keychain or secrets capability, so this is the
// strongest option available to a plugin.

import type { PluginStorage } from '@openforge-app/plugin-sdk'

export type AiProvider = 'anthropic' | 'groq'

export const ANTHROPIC_KEY_STORAGE_KEY = 'anthropicApiKey'
export const GROQ_KEY_STORAGE_KEY = 'groqApiKey'
export const PROVIDER_STORAGE_KEY = 'aiProvider'

export interface AiSettings {
  anthropicKey: string
  groqKey: string
  /** Which provider to prefer when both keys are present. */
  preferred: AiProvider
}

/** The provider used when the user has never expressed a preference. */
export const DEFAULT_PROVIDER: AiProvider = 'anthropic'

function isProvider(value: unknown): value is AiProvider {
  return value === 'anthropic' || value === 'groq'
}

/**
 * A stored key, or '' when there is none. Whitespace-only is treated as absent so a key
 * the user blanked out can't leave Refine enabled but failing at call time. A store we
 * can't read is indistinguishable from an unset key from the UI's point of view, and
 * gating Refine beats throwing during a settings render.
 */
async function readKey(storage: PluginStorage, storageKey: string): Promise<string> {
  try {
    const value = await storage.global.get<string>(storageKey)
    return typeof value === 'string' ? value.trim() : ''
  } catch {
    return ''
  }
}

/**
 * The stored preference, or the default when it is unset, unrecognised, or unreadable.
 * Guarded like the keys are: reaching `storage.global` can throw synchronously where a
 * caller has no storage at all, and a settings read must never take a render down.
 */
async function readProvider(storage: PluginStorage): Promise<AiProvider> {
  try {
    const value = await storage.global.get<string>(PROVIDER_STORAGE_KEY)
    return isProvider(value) ? value : DEFAULT_PROVIDER
  } catch {
    return DEFAULT_PROVIDER
  }
}

export async function readAiSettings(storage: PluginStorage): Promise<AiSettings> {
  const [anthropicKey, groqKey, preferred] = await Promise.all([
    readKey(storage, ANTHROPIC_KEY_STORAGE_KEY),
    readKey(storage, GROQ_KEY_STORAGE_KEY),
    readProvider(storage),
  ])
  return { anthropicKey, groqKey, preferred }
}

/** Stores a trimmed key, or removes it entirely when the field is cleared. */
async function writeKey(storage: PluginStorage, storageKey: string, key: string): Promise<void> {
  const trimmed = key.trim()
  if (trimmed) await storage.global.set(storageKey, trimmed)
  else await storage.global.delete(storageKey)
}

export function writeAnthropicKey(storage: PluginStorage, key: string): Promise<void> {
  return writeKey(storage, ANTHROPIC_KEY_STORAGE_KEY, key)
}

export function writeGroqKey(storage: PluginStorage, key: string): Promise<void> {
  return writeKey(storage, GROQ_KEY_STORAGE_KEY, key)
}

export async function writePreferredProvider(
  storage: PluginStorage,
  provider: AiProvider,
): Promise<void> {
  await storage.global.set(PROVIDER_STORAGE_KEY, provider)
}

/** The key for a given provider, or '' when that provider has none. */
export function keyFor(settings: AiSettings, provider: AiProvider): string {
  return provider === 'anthropic' ? settings.anthropicKey : settings.groqKey
}

/**
 * Which provider a Refine will actually use, or `null` when neither has a key.
 *
 * The preference decides only when it can be honoured. A user who prefers one provider
 * but has only pasted the other's key gets a working Refine rather than an error telling
 * them to go and change a setting they never knowingly chose.
 */
export function resolveProvider(settings: AiSettings): AiProvider | null {
  if (keyFor(settings, settings.preferred)) return settings.preferred
  const other: AiProvider = settings.preferred === 'anthropic' ? 'groq' : 'anthropic'
  if (keyFor(settings, other)) return other
  return null
}

/** Whether Refine has any usable provider — what the dialog gates on. */
export function hasUsableProvider(settings: AiSettings): boolean {
  return resolveProvider(settings) !== null
}
