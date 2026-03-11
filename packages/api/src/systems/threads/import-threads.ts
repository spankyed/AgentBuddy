/**
 * Thread Import
 *
 * Imports threads from an exported JSON file, recreating messages and
 * restoring thread relations via shortCode mapping.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { EARS } from '@/core/types'
import { tx } from '@/core/ears/helpers/transaction'
import { repository } from '@/repository'
import type { ExportedThreadsData, ExportedThread } from './export-types'

interface ImportResult {
  created: number
  skipped: number
  messagesCreated: number
  relationsCreated: number
  errors: string[]
}

export function importThreads(importDir: string): ImportResult {
  const result: ImportResult = { created: 0, skipped: 0, messagesCreated: 0, relationsCreated: 0, errors: [] }

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

  // Get valid statuses and tags from settings
  const threadsSettings = repository.settingsQueries.getPluginSettings('threads')
  const validStatuses = new Set(threadsSettings?.statuses?.map((s: any) => s.label) || [])
  const validTags = new Set(threadsSettings?.tags?.map((t: any) => t.name) || [])
  const fallbackStatus = threadsSettings?.statuses?.[0]?.label || 'Backlog'

  // Pass 1: Create threads + messages, build shortCode mapping
  const shortCodeMap = new Map<string, EARS.EntityId>() // oldShortCode → newEntityId

  for (const thread of parsed.threads) {
    try {
      // Validate status
      const status = validStatuses.has(thread.status) ? thread.status : fallbackStatus

      // Filter tags to valid ones
      const tags = thread.tags.filter(t => validTags.has(t))

      const { id: newThreadId } = repository.threadCommands.create({
        topic: thread.topic,
        instructions: thread.instructions,
        tags,
      })

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

      // Map old shortCode to new entity ID
      if (thread.shortCode) {
        shortCodeMap.set(thread.shortCode, newThreadId)
      }

      // Create messages
      let lastMessageTimestamp = 0
      for (const msg of thread.messages) {
        const messageTx = tx(EARS.Entity.Message)
          .put('text', msg.text)
          .put('timestamp', msg.timestamp)
          .put('sender', msg.sender)
          .put('createdAt', msg.timestamp)
          .put('updatedAt', msg.timestamp)

        const messageId = messageTx
          .link(EARS.RelKind.CONTAINS, newThreadId)
          .id()

        tx(newThreadId).link(EARS.RelKind.CONTAINS, messageId)

        if (msg.timestamp > lastMessageTimestamp) {
          lastMessageTimestamp = msg.timestamp
        }
        result.messagesCreated++
      }

      // Update lastMessageTimestamp
      if (lastMessageTimestamp > 0) {
        repository.threadCommands.update(newThreadId, { lastMessageTimestamp })
      }

      result.created++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      result.errors.push(`Failed to create thread "${thread.topic}": ${message}`)
      result.skipped++
    }
  }

  // Pass 2: Restore relations via shortCode mapping
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

  return result
}
