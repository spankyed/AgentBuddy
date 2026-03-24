/**
 * Thread Export
 *
 * Exports all threads with their messages and linked thread references.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { EARS } from '@/core/types'
import { createExportDir } from '@/core/helpers/paths'
import { extractMediaRefs, copyMediaByRef } from '@/core/helpers/media'
import type { MediaRef } from '@/core/helpers/media'
import { repository } from '@/repository'
import type { ExportedThread, ExportedThreadsData, ExportedMessage, ExportedThreadLink } from './export-types'
import type { ThreadEntity } from './types'

export function exportThreads(outputDir: string): { filePath: string; threadCount: number; mediaCopied: number } {
  outputDir = createExportDir(outputDir, 'threads')
  const threads = repository.threadQueries.all()

  const exportedThreads: ExportedThread[] = []

  for (const thread of threads) {
    const messages = repository.threadQueries.messages(thread.id)
    const linkedThreads = repository.threadQueries.linkedThreads(thread.id)

    // Sort messages by timestamp ascending
    const sortedMessages = [...messages].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))

    const exportedMessages: ExportedMessage[] = sortedMessages.map(msg => ({
      text: msg.text || '',
      sender: msg.sender as 'user' | 'assistant' | 'system',
      timestamp: msg.timestamp || 0,
    }))

    const exportedLinks: ExportedThreadLink[] = linkedThreads
      // .filter(link => link.shortCode)
      .map(link => ({
        shortCode: link.shortCode as string,
        relation: link.relation as ExportedThreadLink['relation'],
      }))

    const exported: ExportedThread = {
      topic: thread.topic,
      instructions: thread.instructions,
      status: thread.status,
      tags: thread.tags || [],
      shortCode: thread.shortCode || '',
      timestamp: thread.timestamp,
      messages: exportedMessages,
      linkedThreads: exportedLinks,
    }

    if (thread.sideTopics?.length) exported.sideTopics = thread.sideTopics
    if (thread.pinned) exported.pinned = thread.pinned

    exportedThreads.push(exported)
  }

  // Collect media refs from all thread instructions
  const allRefs: MediaRef[] = []
  for (const thread of exportedThreads) {
    allRefs.push(...extractMediaRefs(thread.instructions))
  }

  const exportData: ExportedThreadsData = {
    version: 1,
    threads: exportedThreads,
  }

  const filePath = path.join(outputDir, 'exported-threads.json')
  fs.writeFileSync(filePath, JSON.stringify(exportData, null, 2))

  const mediaCopied = copyMediaByRef(allRefs, outputDir)

  return { filePath, threadCount: exportedThreads.length, mediaCopied }
}
