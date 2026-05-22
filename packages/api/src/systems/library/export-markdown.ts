/**
 * Flat Markdown Library Export
 *
 * Exports library items as individual .md files with a flat media/ folder,
 * matching the default-setup source structure for direct reuse.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { extractMediaRefs, rewriteMediaUrls, copyFlatMedia } from '@/core/shared/media'
import { ensureDirectoryExists, createExportDir } from '@/core/shared/paths'
import type { ExportedItem } from './export-types'
import { buildExportTree } from './export-library'
import { toSlug, uniqueFilename, buildFrontmatter, serializeContentToMarkdown } from './utils'

function escapeQuotes(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}
import { writeExportFile } from '@/core/shared/export'

export function exportLibraryMarkdown(outputDir: string): { filePath: string; itemCount: number; mediaCopied: number } {
  outputDir = createExportDir(outputDir, 'library')
  const { items, itemCount } = buildExportTree()

  // First pass: collect all media refs and build a flat filename map
  const mediaFilenameMap = new Map<string, string>() // "entityId/filename" → flat filename
  const usedMediaNames = new Set<string>()
  collectAndMapMedia(items, mediaFilenameMap, usedMediaNames)

  // Second pass: write files
  const usedDocNames = new Set<string>()
  writeItems(items, outputDir, mediaFilenameMap, usedDocNames)

  // Copy media files to flat media/ folder
  const mediaCopied = copyFlatMedia(mediaFilenameMap, outputDir)

  return { filePath: outputDir, itemCount, mediaCopied }
}

function collectAndMapMedia(
  items: ExportedItem[],
  mediaFilenameMap: Map<string, string>,
  usedMediaNames: Set<string>,
): void {
  for (const item of items) {
    if (item.type === 'document') {
      for (const section of item.content) {
        if ((section.type === 'markdown' || section.type === 'text') && 'text' in section) {
          const refs = extractMediaRefs(section.text)
          for (const ref of refs) {
            const key = `${ref.entityId}/${ref.filename}`
            if (mediaFilenameMap.has(key)) continue
            const flat = uniqueFilename(ref.filename, usedMediaNames)
            usedMediaNames.add(flat)
            mediaFilenameMap.set(key, flat)
          }
        }
      }
    } else if (item.type === 'collection') {
      collectAndMapMedia(item.children, mediaFilenameMap, usedMediaNames)
    }
  }
}

function writeItems(
  items: ExportedItem[],
  dir: string,
  mediaFilenameMap: Map<string, string>,
  usedNames: Set<string>,
): void {
  for (const item of items) {
    if (item.type === 'symlink') continue

    if (item.type === 'document') {
      const slug = toSlug(item.name)
      const filename = uniqueFilename(`${slug}.md`, usedNames)
      usedNames.add(filename)

      const frontmatter = buildFrontmatter(item.tags, item.name, item.id)
      let body = serializeContentToMarkdown(item.content)
      body = rewriteMediaUrls(body, mediaFilenameMap)

      writeExportFile(dir, filename, frontmatter + body)
    } else if (item.type === 'collection') {
      const slug = toSlug(item.name)
      const dirName = uniqueFilename(slug, usedNames)
      usedNames.add(dirName)

      const subDir = path.join(dir, dirName)
      ensureDirectoryExists(subDir)

      const metaFields: string[] = []
      if (item.id) metaFields.push(`id: "${escapeQuotes(item.id)}"`)
      metaFields.push(`name: "${escapeQuotes(item.name)}"`)
      if (item.description) metaFields.push(`description: "${escapeQuotes(item.description)}"`)
      const metaContent = `---\n${metaFields.join('\n')}\n---\n`
      writeExportFile(subDir, '_meta.md', metaContent)

      const childNames = new Set<string>(['_meta.md'])
      writeItems(item.children, subDir, mediaFilenameMap, childNames)
    }
  }
}
