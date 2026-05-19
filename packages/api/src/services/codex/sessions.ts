/**
 * Codex session listing — reads JSONL files from `~/.codex/sessions/`.
 *
 * Mirrors `packages/api/src/services/claude-code/sessions.ts` but for
 * Codex's date-based directory layout (YYYY/MM/DD/*.jsonl).
 *
 * Each JSONL file starts with a `session_meta` line containing `id`, `cwd`,
 * `timestamp`, etc. User messages are `response_item` entries with
 * `role: "user"` and `content[].type === "input_text"`.
 */

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as readline from 'readline'

// ─── Directory discovery ────────────────────────────────────────────────────

export function configDir(): string {
  return process.env.CODEX_HOME || path.join(os.homedir(), '.codex')
}

export function sessionsDir(): string {
  return path.join(configDir(), 'sessions')
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CodexSessionInfo {
  id: string
  file: string
  cwd?: string
  title?: string
  modifiedAt: Date
  size: number
  provider: 'codex'
}

// ─── Internals ──────────────────────────────────────────────────────────────

/**
 * Read the first few lines of a JSONL file to extract session metadata
 * and derive a title from the first real user message.
 */
async function extractMeta(filePath: string): Promise<{ id?: string; cwd?: string; title?: string }> {
  let id: string | undefined
  let cwd: string | undefined
  let title: string | undefined

  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  })

  let lineCount = 0
  for await (const line of rl) {
    if (lineCount++ > 50) { rl.close(); break } // Don't scan the entire file
    if (!line) continue
    try {
      const obj = JSON.parse(line)

      // Extract session_meta (always first line)
      if (obj.type === 'session_meta' && obj.payload) {
        id = obj.payload.id
        cwd = obj.payload.cwd
      }

      // Derive title from first real user message
      if (!title && obj.type === 'response_item' && obj.payload?.role === 'user') {
        const content = obj.payload.content
        if (Array.isArray(content)) {
          for (const item of content) {
            if (item.type === 'input_text' && item.text && !item.text.startsWith('<environment_context>')) {
              title = item.text.slice(0, 60).replace(/\n/g, ' ')
              break
            }
          }
        }
      }

      if (id && title) { rl.close(); break }
    } catch { /* skip malformed lines */ }
  }

  return { id, cwd, title }
}

/**
 * Recursively find all .jsonl files under a directory.
 */
async function findJsonlFiles(dir: string): Promise<string[]> {
  const results: string[] = []
  let entries: fs.Dirent[]
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true })
  } catch {
    return results
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...await findJsonlFiles(full))
    } else if (entry.name.endsWith('.jsonl')) {
      results.push(full)
    }
  }
  return results
}

// ─── API ────────────────────────────────────────────────────────────────────

/** List all Codex sessions across all date directories. */
export async function listAll(opts: { limit?: number } = {}): Promise<CodexSessionInfo[]> {
  const root = sessionsDir()
  const files = await findJsonlFiles(root)
  if (!files.length) return []

  const CONCURRENCY = 8
  const infos: CodexSessionInfo[] = []

  for (let i = 0; i < files.length; i += CONCURRENCY) {
    const batch = files.slice(i, i + CONCURRENCY)
    const results = await Promise.all(
      batch.map(async (file) => {
        try {
          const [meta, stat] = await Promise.all([
            extractMeta(file),
            fs.promises.stat(file),
          ])
          if (!meta.id) return null
          return {
            id: meta.id,
            file,
            cwd: meta.cwd,
            title: meta.title || `Session ${meta.id.slice(0, 8)}`,
            modifiedAt: stat.mtime,
            size: stat.size,
            provider: 'codex' as const,
          }
        } catch {
          return null
        }
      }),
    )
    for (const r of results) { if (r) infos.push(r) }
  }

  infos.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime())
  return opts.limit ? infos.slice(0, opts.limit) : infos
}

/** Parse a Codex JSONL file into an array of entries. */
export async function viewByFile(
  filePath: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<any[]> {
  const entries: any[] = []
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  })
  let lineNum = 0
  const offset = opts.offset ?? 0
  const limit = opts.limit

  for await (const line of rl) {
    if (!line) continue
    if (lineNum < offset) { lineNum++; continue }
    if (limit && entries.length >= limit) { rl.close(); break }
    try {
      entries.push(JSON.parse(line))
    } catch {
      entries.push({ type: '__parse_error', raw: line })
    }
    lineNum++
  }
  return entries
}
