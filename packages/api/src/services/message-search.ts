/*─────────────────────────────────────────────────────────────
 * message-search.ts – Full-text search for messages (MiniSearch)
 *
 * In-memory FTS index rebuilt on startup from EARS data.
 * Provides synchronous search matching the qx() pattern.
 *─────────────────────────────────────────────────────────────*/
import MiniSearch from 'minisearch'
import { qx } from '@/core/ears/helpers/query'
import { EARS } from '@/core/types'
import { createLogger } from '@/core/helpers/debug/logger'

const logger = createLogger('message-search')

/* ── Types ──────────────────────────────────────────────── */

interface IndexedMessage {
  id: string
  text: string
  threadId: string
  sender: string
  timestamp: number
}

export interface MessageSearchResult {
  messageId: EARS.EntityId
  threadId: EARS.EntityId
  text: string
  sender: string
  timestamp: number
  score: number
  terms: string[]
}

export interface SearchOptions {
  limit?: number
  threadId?: EARS.EntityId
  sender?: string
  prefix?: boolean
  fuzzy?: number | false
}

/* ── Index ──────────────────────────────────────────────── */

const index = new MiniSearch<IndexedMessage>({
  fields: ['text'],
  storeFields: ['threadId', 'sender', 'timestamp'],
  searchOptions: {
    prefix: true,
    fuzzy: 0.2,
    combineWith: 'AND',
  },
})

/* ── Rebuild (startup) ──────────────────────────────────── */

export function rebuildIndex(): void {
  index.removeAll()

  const docs: IndexedMessage[] = []

  // Iterate threads → messages (preserves thread-message relationship)
  const threads = qx(EARS.Entity.Thread).ids()

  for (const threadId of threads) {
    const messages = qx(threadId)
      .linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Message)
      .pick(['text', 'sender', 'timestamp', 'deleted'] as const)

    for (const msg of messages) {
      const m = msg as any
      if (m.deleted || !m.text || m.sender === 'marker') continue

      docs.push({
        id: m.id as string,
        text: m.text,
        threadId: threadId as string,
        sender: m.sender,
        timestamp: m.timestamp,
      })
    }
  }

  index.addAll(docs)
  logger.info(`FTS index built: ${docs.length} messages`)
}

/* ── Incremental updates ────────────────────────────────── */

export function addMessage(
  id: EARS.EntityId,
  text: string,
  sender: string,
  threadId: EARS.EntityId,
  timestamp: number,
): void {
  if (!text || sender === 'marker') return
  index.add({
    id: id as string,
    text,
    threadId: threadId as string,
    sender,
    timestamp,
  })
}

export function removeMessage(id: EARS.EntityId): void {
  try { index.discard(id as string) } catch { /* not indexed */ }
}

export function removeMessages(ids: EARS.EntityId[]): void {
  for (const id of ids) removeMessage(id)
}

/* ── Search ─────────────────────────────────────────────── */

export function search(query: string, options?: SearchOptions): MessageSearchResult[] {
  if (!query.trim()) return []

  const limit = options?.limit ?? 20
  const searchOpts: any = {}
  if (options?.prefix !== undefined) searchOpts.prefix = options.prefix
  if (options?.fuzzy !== undefined) searchOpts.fuzzy = options.fuzzy

  const filter = buildFilter(options)
  if (filter) searchOpts.filter = filter

  const raw = index.search(query, searchOpts)

  return raw.slice(0, limit).map(r => ({
    messageId: r.id as EARS.EntityId,
    threadId: r.threadId as EARS.EntityId,
    text: r.text,
    sender: r.sender,
    timestamp: r.timestamp,
    score: r.score,
    terms: r.terms,
  }))
}

export function suggest(query: string, limit = 5): string[] {
  if (!query.trim()) return []
  return index.autoSuggest(query, { combineWith: 'AND' }).slice(0, limit).map(s => s.suggestion)
}

export function getIndexSize(): number {
  return index.documentCount
}

/* ── Helpers ────────────────────────────────────────────── */

function buildFilter(options?: SearchOptions) {
  if (!options?.threadId && !options?.sender) return undefined

  return (result: any) => {
    if (options.threadId && result.threadId !== options.threadId) return false
    if (options.sender && result.sender !== options.sender) return false
    return true
  }
}
