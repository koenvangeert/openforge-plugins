import { describe, expect, it, vi } from 'vitest'
import { emptySpendIndex, indexTranscript, iterateRows, mergeTranscript } from './spendIndex'
import { listTranscripts, resolveTranscriptRoot, scanTranscripts, type TranscriptFileSystem } from './scanner'

const ROOT = '/home/dev/.claude/projects'

function usageLine(overrides: { id?: string; output?: number; cwd?: string; at?: string } = {}): string {
  return JSON.stringify({
    type: 'assistant',
    timestamp: overrides.at ?? '2026-08-27T09:15:00.000Z',
    cwd: overrides.cwd ?? '/worktrees/KVG-1',
    message: {
      id: overrides.id ?? 'msg_1',
      model: 'claude-opus-5',
      usage: { input_tokens: 1, output_tokens: overrides.output ?? 100, cache_read_input_tokens: 0 },
    },
  })
}

function fakeFileSystem(tree: Record<string, string | null>): TranscriptFileSystem {
  const dirOf = (path: string) => path.split('/').slice(0, -1).join('/')
  return {
    async readDir({ path }) {
      const parent = path ?? ''
      return Object.entries(tree)
        .filter(([entryPath]) => dirOf(entryPath) === parent)
        .map(([entryPath, content]) => ({
          name: entryPath.split('/').pop()!,
          path: entryPath,
          isDir: content === null,
          size: content?.length ?? null,
          modifiedAt: content === null ? null : 7,
        }))
    },
    readTextFileChunks({ path }) {
      const content = tree[path]
      if (typeof content !== 'string') throw new Error(`no such transcript: ${path}`)
      return (async function* () {
        for (let offset = 0; offset < content.length; offset += 16) yield content.slice(offset, offset + 16)
      })()
    },
  }
}

describe('resolveTranscriptRoot', () => {
  it('honours CLAUDE_CONFIG_DIR so a relocated Claude Code install is still read', () => {
    expect(resolveTranscriptRoot({ CLAUDE_CONFIG_DIR: '/custom/claude' })).toBe('/custom/claude/projects')
  })

  it('falls back to the home directory when the override is blank', () => {
    expect(resolveTranscriptRoot({ CLAUDE_CONFIG_DIR: '   ' })).toMatch(/\.claude\/projects$/)
  })
})

describe('listTranscripts', () => {
  it('finds subagent transcripts nested below a session directory', async () => {
    const fs = fakeFileSystem({
      'proj': null,
      'proj/session.jsonl': usageLine(),
      'proj/session': null,
      'proj/session/subagents': null,
      'proj/session/subagents/agent-1.jsonl': usageLine({ id: 'msg_2' }),
    })

    const found = await listTranscripts(fs, ROOT)

    expect(found.map((entry) => entry.path).sort()).toEqual([
      'proj/session.jsonl',
      'proj/session/subagents/agent-1.jsonl',
    ])
  })

  it('ignores files that are not transcripts', async () => {
    const fs = fakeFileSystem({ 'proj': null, 'proj/notes.md': 'hi', 'proj/session.jsonl': usageLine() })

    expect(await listTranscripts(fs, ROOT)).toHaveLength(1)
  })

  it('survives a directory it cannot read', async () => {
    const fs = fakeFileSystem({ 'proj': null, 'proj/session.jsonl': usageLine() })
    const failing: TranscriptFileSystem = {
      readDir: (request) => (request.path === 'proj' ? Promise.reject(new Error('EACCES')) : fs.readDir(request)),
      readTextFileChunks: fs.readTextFileChunks,
    }

    expect(await listTranscripts(failing, ROOT)).toEqual([])
  })
})

describe('scanTranscripts', () => {
  it('indexes a subagent transcript alongside its parent, since their responses are disjoint', async () => {
    const fs = fakeFileSystem({
      'proj': null,
      'proj/session.jsonl': usageLine({ id: 'msg_1' }),
      'proj/session': null,
      'proj/session/subagents': null,
      'proj/session/subagents/agent-1.jsonl': usageLine({ id: 'msg_2' }),
    })
    const index = emptySpendIndex()

    const result = await scanTranscripts({ fs, root: ROOT, index })

    expect(result).toMatchObject({ transcriptsSeen: 2, transcriptsRead: 2, responsesIndexed: 2 })
    expect([...iterateRows(index)].reduce((sum, row) => sum + row.tokens.output, 0)).toBe(200)
  })

  it('collapses a streamed response spread over several records to its complete usage', async () => {
    const fs = fakeFileSystem({
      'proj': null,
      'proj/session.jsonl': [
        usageLine({ output: 6 }),
        usageLine({ output: 6 }),
        usageLine({ output: 206 }),
      ].join('\n'),
    })
    const index = emptySpendIndex()

    await scanTranscripts({ fs, root: ROOT, index })

    expect([...iterateRows(index)][0]!.tokens.output).toBe(206)
  })

  it('skips a transcript it has already read at the same size and mtime', async () => {
    const content = usageLine()
    const fs = fakeFileSystem({ 'proj': null, 'proj/session.jsonl': content })
    const index = emptySpendIndex()
    mergeTranscript(index, 'proj/session.jsonl', indexTranscript([], { sizeBytes: content.length, modifiedAt: 7 }))
    const chunks = vi.spyOn(fs, 'readTextFileChunks')

    const result = await scanTranscripts({ fs, root: ROOT, index })

    expect(result).toMatchObject({ transcriptsSeen: 1, transcriptsRead: 0 })
    expect(chunks).not.toHaveBeenCalled()
  })

  it('counts a transcript it cannot read and keeps scanning the rest', async () => {
    const fs = fakeFileSystem({
      'proj': null,
      'proj/broken.jsonl': usageLine(),
      'proj/good.jsonl': usageLine({ id: 'msg_2' }),
    })
    const failing: TranscriptFileSystem = {
      readDir: fs.readDir,
      readTextFileChunks: (request) => {
        if (request.path === 'proj/broken.jsonl') throw new Error('EACCES')
        return fs.readTextFileChunks(request)
      },
    }
    const index = emptySpendIndex()

    const result = await scanTranscripts({ fs: failing, root: ROOT, index })

    expect(result).toMatchObject({ transcriptsFailed: 1, transcriptsRead: 1 })
  })

  it('propagates an abort so a stopping background service does not keep reading', async () => {
    const fs = fakeFileSystem({ 'proj': null, 'proj/session.jsonl': usageLine() })
    const controller = new AbortController()
    controller.abort()

    await expect(
      scanTranscripts({ fs, root: ROOT, index: emptySpendIndex(), signal: controller.signal }),
    ).rejects.toThrow()
  })
})
