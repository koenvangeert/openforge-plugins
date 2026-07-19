export interface SkillInfo {
  name: string
  description: string | null
  agent: string | null
  template: string | null
  level: 'project' | 'user'
  source_dir: string
  source_path: string
  file_name: string | null
  relative_path: string
}

export const SKILL_SOURCE_DIRS = ['.agents', '.claude', '.opencode', '.codex', '.pi'] as const

export type SkillSourceDir = typeof SKILL_SOURCE_DIRS[number]
