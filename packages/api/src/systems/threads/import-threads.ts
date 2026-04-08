/**
 * Thread Import
 *
 * Imports threads from an exported JSON file, recreating messages with full data
 * (blocks, references, commands), artifacts, fork relations, and media.
 * Remaps thread:// links in message text and context references.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { EARS } from '@/core/types'
import { qx } from '@/core/ears/helpers/query'
import { tx } from '@/core/ears/helpers/transaction'
import { restoreJsonMediaRefs } from '@/core/helpers/media'
import { repository } from '@/repository'
import type { ExportedThreadsData } from './export-types'

interface ImportResult {
  created: number
  skipped: number
  messagesCreated: number
  relationsCreated: number
  artifactsCreated: number
  mediaRestored: number
  errors: string[]
}

export function importThreads(importDir: string): ImportResult {
  const result: ImportResult = { created: 0, skipped: 0, messagesCreated: 0, relationsCreated: 0, artifactsCreated: 0, mediaRestored: 0, errors: [] }

  const jsonPath = path.join(importDir, 'exported-threads.json')
  if (!fs.existsSync(jsonPath)) {
    result.errors.push(`No exported-threads.json found in ${importDir}`)
    return result
  }

  let parsed: ExportedThreadsData
  try {
    parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))
  } catch {
    result.errors.push('Failed to parse exported-threads.json')
    return result
  }

  if (!parsed?.threads || !Array.isArray(parsed.threads)) {
    result.errors.push('Invalid import data: expected a threads array')
    return result
  }

  const hasMedia = fs.existsSync(path.join(importDir, 'media'))

  // Get valid statuses and tags from settings
  const threadsSettings = repository.settingsQueries.getPluginSettings('threads')
  const validStatuses = new Set(threadsSettings?.statuses?.map((s: any) => s.label) || [])
  const validTags = new Set(threadsSettings?.tags?.map((t: any) => t.name) || [])
  const fallbackStatus = threadsSettings?.statuses?.[0]?.label || 'Backlog'

  const shortCodeMap = new Map<string, EARS.EntityId>()
  const oldIdToNewId = new Map<string, EARS.EntityId>()
  const createdThreadIds: EARS.EntityId[] = []

  // Pass 1: Create threads, messages, artifacts
  for (const thread of parsed.threads) {
    try {
      const status = validStatuses.has(thread.status) ? thread.status : fallbackStatus
      const tags = thread.tags.filter(t => validTags.has(t))

      const { id: newThreadId } = repository.threadCommands.create({
        topic: thread.topic,
        instructions: thread.instructions,
        tags,
      })

      // Restore media from instructions
      if (hasMedia) {
        const { content: restoredInstructions, mediaRestored } = restoreJsonMediaRefs(
          thread.instructions, newThreadId, importDir,
        )
        if (mediaRestored > 0) {
          repository.threadCommands.update(newThreadId, { instructions: restoredInstructions })
          result.mediaRestored += mediaRestored
        }
      }

      // Update status if different from default
      if (status !== fallbackStatus) {
        repository.threadCommands.update(newThreadId, { status })
      }

      // Update optional fields
      if (thread.sideTopics?.length || thread.pinned) {
        const updates: Record<string, any> = {}
        if (thread.sideTopics?.length) updates.sideTopics = thread.sideTopics
        if (thread.pinned) updates.pinned = thread.pinned
        tx(newThreadId).updateBatch(updates)
      }

      // Build ID mappings
      if (thread.shortCode) {
        shortCodeMap.set(thread.shortCode, newThreadId)
      }
      if (thread.id) {
        oldIdToNewId.set(thread.id, newThreadId)
      }
      createdThreadIds.push(newThreadId)

      // Create messages with full fields
      let lastMessageTimestamp = 0
      for (const msg of thread.messages) {
        const messageTx = tx(EARS.Entity.Message)
          .put('text', msg.text)
          .put('timestamp', msg.timestamp)
          .put('sender', msg.sender)
          .put('createdAt', msg.timestamp)
          .put('updatedAt', msg.timestamp)

        if (msg.responseTimestamp) messageTx.put('responseTimestamp', msg.responseTimestamp)
        if (msg.blocks) messageTx.put('blocks', msg.blocks)
        if (msg.blockResponse !== undefined) messageTx.put('blockResponse', msg.blockResponse)
        if (msg.forkable !== undefined) messageTx.put('forkable', msg.forkable)
        if (msg.isCommand) messageTx.put('isCommand', msg.isCommand)
        if (msg.command) messageTx.put('command', msg.command)
        if (msg.references) messageTx.put('references', msg.references)

        const messageId = messageTx
          .link(EARS.RelKind.CONTAINS, newThreadId)
          .id()

        tx(newThreadId).link(EARS.RelKind.CONTAINS, messageId)

        // Restore media in message text
        if (hasMedia) {
          const { content: restoredText, mediaRestored } = restoreJsonMediaRefs(
            msg.text, messageId, importDir,
          )
          if (mediaRestored > 0) {
            tx(messageId).updateBatch({ text: restoredText })
            result.mediaRestored += mediaRestored
          }

          // Restore media in image references
          if (msg.references?.images) {
            let refsChanged = false
            for (const img of msg.references.images) {
              if (img.url.startsWith('media://')) {
                const restored = restoreJsonMediaRefs(`![](${img.url})`, messageId, importDir)
                if (restored.mediaRestored > 0) {
                  const urlMatch = restored.content.match(/media:\/\/[^)]+/)
                  if (urlMatch) {
                    img.url = urlMatch[0]
                    refsChanged = true
                  }
                  result.mediaRestored += restored.mediaRestored
                }
              }
            }
            if (refsChanged) {
              tx(messageId).updateBatch({ references: msg.references })
            }
          }
        }

        if (msg.timestamp > lastMessageTimestamp) {
          lastMessageTimestamp = msg.timestamp
        }
        result.messagesCreated++
      }

      if (lastMessageTimestamp > 0) {
        repository.threadCommands.update(newThreadId, { lastMessageTimestamp })
      }

      // Create artifacts
      if (thread.artifacts?.length) {
        for (const artifact of thread.artifacts) {
          try {
            repository.chatCommands.createArtifact({
              artifactType: artifact.artifactType,
              title: artifact.title ?? '',
              content: artifact.content,
              threadId: newThreadId,
            })
            result.artifactsCreated++
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            result.errors.push(`Failed to create artifact "${artifact.title}" for thread "${thread.topic}": ${message}`)
          }
        }
      }

      result.created++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      result.errors.push(`Failed to create thread "${thread.topic}": ${message}`)
      result.skipped++
    }
  }

  // Pass 2: Restore relations
  for (const thread of parsed.threads) {
    if (!thread.linkedThreads?.length || !thread.shortCode) continue

    const sourceId = shortCodeMap.get(thread.shortCode)
    if (!sourceId) continue

    const linkedThreads: { id: string; relation: string }[] = []

    for (const link of thread.linkedThreads) {
      const targetId = shortCodeMap.get(link.shortCode)
      if (!targetId) {
        result.errors.push(`Thread "${thread.topic}": linked thread with shortCode "${link.shortCode}" not found in import`)
        continue
      }
      linkedThreads.push({ id: targetId, relation: link.relation })
      result.relationsCreated++
    }

    if (linkedThreads.length) {
      try {
        repository.threadCommands.update(sourceId, { linkedThreads })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        result.errors.push(`Failed to restore relations for "${thread.topic}": ${message}`)
      }
    }
  }

  // Restore fork relations
  for (const thread of parsed.threads) {
    if (!thread.forkedFrom) continue
    const forkedId = thread.shortCode ? shortCodeMap.get(thread.shortCode) : undefined
    const sourceId = shortCodeMap.get(thread.forkedFrom)
    if (forkedId && sourceId) {
      try {
        repository.threadCommands.linkFork(sourceId, forkedId)
        result.relationsCreated++
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        result.errors.push(`Failed to restore fork relation for "${thread.topic}": ${message}`)
      }
    }
  }

  // Pass 3: Remap thread:// links in message text and context references
  remapThreadRefs(oldIdToNewId, shortCodeMap, createdThreadIds)

  return result
}

/** Remap thread:// links in message text and context references using oldId→newId mapping. */
function remapThreadRefs(
  oldIdToNewId: Map<string, EARS.EntityId>,
  shortCodeToNewId: Map<string, EARS.EntityId>,
  createdThreadIds: EARS.EntityId[],
): void {
  for (const threadId of createdThreadIds) {
    const messages = qx(threadId)
      .linksPick(
        EARS.RelKind.CONTAINS,
        ['id', 'text', 'references'] as const,
        EARS.Entity.Message,
      ) ?? []

    for (const msg of messages) {
      if (!msg.id) continue
      let textChanged = false
      let refsChanged = false

      // Remap thread:// links in text
      let updatedText = msg.text || ''
      updatedText = updatedText.replace(
        /\[([^\]]*)\]\(thread:\/\/([^)]+)\)/g,
        (_match: string, linkText: string, oldRef: string) => {
          const newId = oldIdToNewId.get(oldRef) ?? shortCodeToNewId.get(oldRef)
          if (newId) {
            textChanged = true
            return `[${linkText}](thread://${newId})`
          }
          return _match
        },
      )

      // Remap context references
      const refs = msg.references as any
      if (refs?.context && Array.isArray(refs.context)) {
        for (const ctx of refs.context) {
          if (ctx.refType === 'thread') {
            const newId = oldIdToNewId.get(ctx.refId) ?? shortCodeToNewId.get(ctx.refId)
            if (newId) {
              ctx.refId = newId
              refsChanged = true
            }
          }
        }
      }

      const updates: Record<string, any> = {}
      if (textChanged) updates.text = updatedText
      if (refsChanged) updates.references = refs
      if (Object.keys(updates).length > 0) {
        tx(msg.id as EARS.EntityId).updateBatch(updates)
      }
    }
  }
}
