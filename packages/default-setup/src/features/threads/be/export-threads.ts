/**
 * Thread Export (V2)
 *
 * Exports all threads with full message data (blocks, references, commands),
 * artifacts, fork relations, and media from both instructions and messages.
 */

import { qx } from '@/core/ears/helpers/query'
import { EARS } from '@/core/types'
import { createExportDir } from '@/core/shared/paths'
import { extractMediaRefs, copyMediaByRef } from '@/core/shared/media'
import { writeExportJson } from '@/core/shared/export'
import type { MediaRef } from '@/core/shared/media'
import { repository } from '@/repository'
import type { ExportedThread, ExportedThreadsData, ExportedMessage, ExportedThreadLink, ExportedArtifact } from './export-types'
import type { MessageEntity } from './types'

export function exportThreads(outputDir: string): { filePath: string; threadCount: number; mediaCopied: number } {
  outputDir = createExportDir(outputDir, 'threads')
  const threads = repository.threadQueries.all()

  const exportedThreads: ExportedThread[] = []

  for (const thread of threads) {
    // Get full message data (all fields, filter deleted)
    const messages = (qx(thread.id)
      .linksPick(
        EARS.RelKind.CONTAINS,
        ['id', 'text', 'sender', 'timestamp', 'blocks', 'blockResponse', 'responseTimestamp', 'forkable', 'references', 'isCommand', 'command', 'deleted'] as const,
        EARS.Entity.Message,
      ) ?? []).filter((m: any) => !m.deleted) as Partial<MessageEntity>[]

    const linkedThreads = repository.threadQueries.linkedThreads(thread.id)

    // Sort messages by timestamp ascending
    const sortedMessages = [...messages].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))

    const exportedMessages: ExportedMessage[] = sortedMessages.map(msg => {
      const exported: ExportedMessage = {
        text: msg.text || '',
        sender: msg.sender as 'user' | 'assistant' | 'system',
        timestamp: msg.timestamp || 0,
      }
      if (msg.responseTimestamp) exported.responseTimestamp = msg.responseTimestamp
      if (msg.blocks) exported.blocks = msg.blocks
      if (msg.blockResponse !== undefined) exported.blockResponse = msg.blockResponse
      if (msg.forkable !== undefined) exported.forkable = msg.forkable
      if (msg.isCommand) exported.isCommand = msg.isCommand
      if (msg.command) exported.command = msg.command
      if (msg.references) exported.references = msg.references
      return exported
    })

    const exportedLinks: ExportedThreadLink[] = linkedThreads
      .map((link: { shortCode: string; relation: string; topic?: string; status?: string }) => ({
        shortCode: link.shortCode as string,
        relation: link.relation as ExportedThreadLink['relation'],
      }))

    // Query fork source
    const forkedFromIds = qx(thread.id)
      .linksTo(EARS.RelKind.Custom('forked_from'), EARS.Entity.Thread, true)
      .ids()
    let forkedFrom: string | undefined
    if (forkedFromIds.length > 0) {
      const sourceThread = qx(forkedFromIds[0]).pickAll()[0]
      if (sourceThread?.shortCode) {
        forkedFrom = sourceThread.shortCode as string
      }
    }

    // Query artifacts
    const artifacts = repository.chatQueries.threadArtifacts(thread.id)
    const exportedArtifacts: ExportedArtifact[] = artifacts.map((a: any) => ({
      id: a.id as string,
      artifactType: a.type,
      title: a.title,
      content: a.content,
    }))

    const exported: ExportedThread = {
      id: thread.id,
      topic: thread.topic,
      instructions: thread.instructions,
      status: thread.status,
      tags: thread.tags || [],
      shortCode: thread.shortCode || '',
      timestamp: thread.timestamp,
      messages: exportedMessages,
      linkedThreads: exportedLinks,
      artifacts: exportedArtifacts,
    }

    if (thread.createdAt) exported.createdAt = thread.createdAt
    if (thread.sideTopics?.length) exported.sideTopics = thread.sideTopics
    if (thread.pinned) exported.pinned = thread.pinned
    if (forkedFrom) exported.forkedFrom = forkedFrom

    exportedThreads.push(exported)
  }

  // Collect media refs from instructions AND message text
  const allRefs: MediaRef[] = []
  for (const thread of exportedThreads) {
    allRefs.push(...extractMediaRefs(thread.instructions))
    for (const msg of thread.messages) {
      allRefs.push(...extractMediaRefs(msg.text))
      // Also check image references for media:// URLs
      if (msg.references?.images) {
        for (const img of msg.references.images) {
          if (img.url.startsWith('media://')) {
            allRefs.push(...extractMediaRefs(`![${img.name}](${img.url})`))
          }
        }
      }
    }
  }

  const exportData: ExportedThreadsData = {
    version: 2,
    threads: exportedThreads,
  }

  const filePath = writeExportJson(outputDir, 'exported-threads.json', exportData)

  const mediaCopied = copyMediaByRef(allRefs, outputDir)

  return { filePath, threadCount: exportedThreads.length, mediaCopied }
}
