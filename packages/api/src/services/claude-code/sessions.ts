/**
 * Session management.
 *
 * The CLI does not expose a `claude session` subcommand — session data lives
 * on disk as JSONL files under `$CLAUDE_CONFIG_DIR` (default `~/.claude`),
 * organised per-project. This module reads those files directly for list /
 * view / get, and uses file operations for rm. Rename, tag, and fork are
 * implemented by appending metadata entries the CLI understands, with a note
 * in the JSDoc that callers should prefer the interactive CLI for them.
 *
 * Important: session JSONL files can be large (multi-MB). `view()` parses
 * them fully, so callers should paginate (`limit`/`offset`) on long sessions.
 */

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { randomUUID } from 'crypto'

// ─── Directory discovery ─────────────────────────────────────────────────────

/** Root of the CLI's config, honouring $CLAUDE_CONFIG_DIR. */
export function configDir(): string {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
}

/**
 * Claude Code encodes the project working directory into a subdir name by
 * replacing path separators with dashes (e.g. `/Users/me/app` →
 * `-Users-me-app`). This mirrors the CLI's own bucket-per-project scheme
 * observed in `~/.claude/projects/…`.
 */
export function projectBucket(cwd: string): string {
  return path.join(configDir(), 'projects', encodeProjectPath(cwd))
}

function encodeProjectPath(cwd: string): string {
  return cwd.replace(/[\\/]/g, '-').replace(/^-/, '-')
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SessionInfo {
  id: string
  file: string
  cwd?: string
  title?: string
  tags?: string[]
  modifiedAt: Date
  size: number
  firstMessageAt?: Date
  lastMessageAt?: Date
}

export interface SessionTranscriptEntry {
  type?: string
  [key: string]: unknown
}

export interface SessionListOptions {
  /** Working directory whose sessions to list. Defaults to `process.cwd()`. */
  cwd?: string
  limit?: number
  offset?: number
}

export interface SessionViewOptions {
  cwd?: string
  limit?: number
  offset?: number
}

// ─── API ─────────────────────────────────────────────────────────────────────

/** List sessions saved for the given working directory. */
export async function list(opts: SessionListOptions = {}): Promise<SessionInfo[]> {
  const cwd = opts.cwd ?? process.cwd()
  const bucket = projectBucket(cwd)

  let files: string[]
  try {
    files = await fs.promises.readdir(bucket)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }

  const jsonl = files.filter(f => f.endsWith('.jsonl'))
  const infos: SessionInfo[] = []

  for (const name of jsonl) {
    const file = path.join(bucket, name)
    const stat = await fs.promises.stat(file).catch(() => null)
    if (!stat) continue
    const id = name.replace(/\.jsonl$/, '')
    infos.push({
      id,
      file,
      cwd,
      modifiedAt: stat.mtime,
      size: stat.size,
    })
  }

  infos.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime())
  const offset = opts.offset ?? 0
  const limit = opts.limit ?? infos.length
  return infos.slice(offset, offset + limit)
}

/** Load basic metadata about a single session. */
export async function get(
  id: string,
  opts: { cwd?: string } = {},
): Promise<SessionInfo | null> {
  const cwd = opts.cwd ?? process.cwd()
  const file = path.join(projectBucket(cwd), `${id}.jsonl`)
  const stat = await fs.promises.stat(file).catch(() => null)
  if (!stat) return null
  return { id, file, cwd, modifiedAt: stat.mtime, size: stat.size }
}

/** Parse a session's JSONL into an in-memory array of entries. */
export async function view(
  id: string,
  opts: SessionViewOptions = {},
): Promise<SessionTranscriptEntry[]> {
  const cwd = opts.cwd ?? process.cwd()
  const file = path.join(projectBucket(cwd), `${id}.jsonl`)
  const raw = await fs.promises.readFile(file, 'utf8')
  const lines = raw.split('\n').filter(l => l.length > 0)
  const offset = opts.offset ?? 0
  const limit = opts.limit ?? lines.length
  const slice = lines.slice(offset, offset + limit)

  const entries: SessionTranscriptEntry[] = []
  for (const line of slice) {
    try {
      entries.push(JSON.parse(line))
    } catch {
      entries.push({ type: '__parse_error', raw: line })
    }
  }
  return entries
}

/** Delete a session's JSONL + any associated subdir. Idempotent. */
export async function remove(
  id: string,
  opts: { cwd?: string } = {},
): Promise<void> {
  const cwd = opts.cwd ?? process.cwd()
  const bucket = projectBucket(cwd)
  const file = path.join(bucket, `${id}.jsonl`)
  const subdir = path.join(bucket, id)

  await fs.promises.rm(file, { force: true })
  await fs.promises.rm(subdir, { recursive: true, force: true })
}

/**
 * Rename a session. Appends a metadata entry the CLI interprets on load.
 *
 * Caveat: this reverse-engineers the JSONL metadata format; if the CLI
 * changes how renames are stored, prefer `claude --resume <id>` + the
 * interactive rename flow.
 */
export async function rename(
  id: string,
  title: string,
  opts: { cwd?: string } = {},
): Promise<void> {
  await appendMetadata(id, { type: 'metadata', title, updatedAt: new Date().toISOString() }, opts)
}

export async function tag(
  id: string,
  tag: string | null,
  opts: { cwd?: string } = {},
): Promise<void> {
  await appendMetadata(id, { type: 'metadata', tag, updatedAt: new Date().toISOString() }, opts)
}

/**
 * Fork a session at a specific point. Copies the JSONL up to (and optionally
 * truncated at) a given message UUID and returns the new session id.
 */
export async function fork(
  id: string,
  opts: { upToMessageId?: string; title?: string; cwd?: string } = {},
): Promise<{ sessionId: string; file: string }> {
  const cwd = opts.cwd ?? process.cwd()
  const bucket = projectBucket(cwd)
  const source = path.join(bucket, `${id}.jsonl`)
  const newId = randomUUID()
  const target = path.join(bucket, `${newId}.jsonl`)

  const raw = await fs.promises.readFile(source, 'utf8')
  const lines = raw.split('\n').filter(l => l.length > 0)

  let keptLines = lines
  if (opts.upToMessageId) {
    const cutIdx = lines.findIndex(line => {
      try { return (JSON.parse(line) as { uuid?: string }).uuid === opts.upToMessageId }
      catch { return false }
    })
    if (cutIdx !== -1) keptLines = lines.slice(0, cutIdx + 1)
  }

  await fs.promises.writeFile(target, keptLines.join('\n') + '\n')
  if (opts.title) {
    await appendMetadata(newId, { type: 'metadata', title: opts.title, updatedAt: new Date().toISOString() }, { cwd })
  }

  return { sessionId: newId, file: target }
}

// ─── Internals ───────────────────────────────────────────────────────────────

async function appendMetadata(
  id: string,
  entry: Record<string, unknown>,
  opts: { cwd?: string },
): Promise<void> {
  const cwd = opts.cwd ?? process.cwd()
  const file = path.join(projectBucket(cwd), `${id}.jsonl`)
  await fs.promises.appendFile(file, JSON.stringify(entry) + '\n')
}
