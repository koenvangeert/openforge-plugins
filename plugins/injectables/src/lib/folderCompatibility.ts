import {
  isOpenForgeAiProviderId,
  OPENFORGE_AI_PROVIDERS,
  type InstalledAiProvider,
  type OpenForgeAiProviderId,
} from '@openforge-app/plugin-sdk'

/** Local skill folders the plugin scans for insert and manage. */
export const LOCAL_SKILL_DIRS = ['.agents', '.claude', '.grok', '.codex', '.pi', '.opencode'] as const
export type LocalSkillDir = (typeof LOCAL_SKILL_DIRS)[number]

const USABLE_FOLDERS: Record<OpenForgeAiProviderId, ReadonlySet<string>> = {
  grok: new Set(['.grok', '.claude', '.agents']),
  'claude-code': new Set(['.claude']),
  codex: new Set(['.codex', '.agents']),
  pi: new Set(['.pi', '.agents']),
  opencode: new Set(['.opencode', '.claude', '.agents']),
}

export function isLocalSkillDir(sourceDir: string | null | undefined): sourceDir is LocalSkillDir {
  return sourceDir != null && (LOCAL_SKILL_DIRS as readonly string[]).includes(sourceDir)
}

export function providerDisplayName(provider: string | null | undefined): string {
  if (provider == null) return 'this provider'
  return OPENFORGE_AI_PROVIDERS.find((item) => item.id === provider)?.displayName ?? provider
}

/** Short agent name for a local skill folder. Claude and Grok are the ones users compare. */
export function folderAgentLabel(sourceDir: string | null | undefined): string | null {
  switch (sourceDir) {
    case '.grok':
      return 'Grok'
    case '.claude':
      return 'Claude'
    case '.agents':
      return 'Agents'
    case '.codex':
      return 'Codex'
    case '.pi':
      return 'Pi'
    case '.opencode':
      return 'OpenCode'
    default:
      return null
  }
}

/** Snippets are usable with every provider. Local folder skills use the matrix. */
export function localSkillUsableWithProvider(
  sourceDir: string | null | undefined,
  provider: string | null | undefined,
): boolean {
  if (!isLocalSkillDir(sourceDir)) return false
  if (provider == null || !isOpenForgeAiProviderId(provider)) return false
  return USABLE_FOLDERS[provider].has(sourceDir)
}

export function compatibleInstalledProviders(
  sourceDir: string | null | undefined,
  installed: readonly InstalledAiProvider[],
): InstalledAiProvider[] {
  if (!isLocalSkillDir(sourceDir)) return []
  return installed.filter((item) => USABLE_FOLDERS[item.id].has(sourceDir))
}

export function unusableFolderReason(provider: string | null | undefined, sourceDir: string): string {
  return `Won’t work with ${providerDisplayName(provider)} — lives in ${sourceDir}`
}
