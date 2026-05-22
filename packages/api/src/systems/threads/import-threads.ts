/**
 * Thread Import
 *
 * Imports threads from an exported JSON file, recreating messages with full data
 * (blocks, references, commands), artifacts, fork relations, and media.
 * Persists original entity IDs to preserve thread:// links and cross-entity context references.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { EARS } from '@/core/types'
import { tx } from '@/core/ears/helpers/transaction'
import { hasIdCollision } from '@/core/shared/repository'
import { restoreJsonMediaRefs } from '@/core/shared/media'
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

  if (!parsed.version || parsed.version < 2) {
    result.errors.push(`Unsupported export version: ${parsed.version || 'unknown'}. Re-export with the latest version.`)
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

  // Pass 1: Create threads, messages, artifacts
  for (const thread of parsed.threads) {
    try {
      const status = validStatuses.has(thread.status) ? thread.status : fallbackStatus
      const tags = thread.tags.filter(t => validTags.has(t))

      // Skip entity if its ID already exists in the database
      if (hasIdCollision(thread.id)) {
        result.errors.push(`Skipped thread "${thread.topic}": entity ID already exists (${thread.id})`)
        result.skipped++
        continue
      }

      const { id: newThreadId } = repository.threadCommands.create({
        topic: thread.topic,
        instructions: thread.instructions,
        tags,
        id: thread.id,
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

      // Build shortCode mapping (still needed for fork/linked thread relations)
      if (thread.shortCode) {
        shortCodeMap.set(thread.shortCode, newThreadId)
      }

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
          // NOTE: Wraps URL in markdown image syntax because restoreJsonMediaRefs operates on markdown content
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

  // Pass 2: Restore relations (uses shortCodes, not entity IDs)
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
    if (!sourceId) {
      result.errors.push(`Fork source "${thread.forkedFrom}" not found in export for "${thread.topic}"`)
    } else if (!forkedId) {
      result.errors.push(`Fork target shortCode not mapped for "${thread.topic}"`)
    } else {
      try {
        repository.threadCommands.linkFork(sourceId, forkedId)
        result.relationsCreated++
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        result.errors.push(`Failed to restore fork relation for "${thread.topic}": ${message}`)
      }
    }
  }

  // No remapThreadRefs needed — entity IDs are persisted, so thread:// links
  // and cross-entity context references (note, document, folder, etc.) are all valid.

  return result
}
