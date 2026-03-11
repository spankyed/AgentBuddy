/**
 * Flat Markdown Library Export
 *
 * Exports library items as individual .md files with a flat media/ folder,
 * matching the scratchpad source structure for direct reuse.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { extractMediaRefs, resolveMedia } from '@/core/helpers/media'
import type { ContentSection } from './types'
import type { ExportedItem } from './export-types'
import { buildExportTree, countItems } from './export-library'

export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function serializeContentToMarkdown(sections: ContentSection[]): string {
  const parts: string[] = []

  for (const section of sections) {
    switch (section.type) {
      case 'markdown':
      case 'text':
        parts.push(section.text)
        break
      case 'code':
        parts.push(`\`\`\`${section.language}\n${section.text}\n\`\`\``)
        break
      case 'field':
        parts.push(
          section.fields.map(f => `**${f.key}**: ${f.value}`).join('\n')
        )
        break
      case 'list':
        parts.push(section.items.map(item => `- ${item}`).join('\n'))
        break
    }
  }

  return parts.join('\n\n')
}

function buildFrontmatter(tags: string[]): string {
  if (!tags.length) return ''
  return `---\ntags: [${tags.join(', ')}]\n---\n\n`
}

function rewriteMediaUrls(
  markdown: string,
  mediaFilenameMap: Map<string, string>,
): string {
  // Replace media://{entityId}/{filename} with media/{mapped-filename}
  return markdown.replace(
    /media:\/\/([^/]+)\/([^)\s]+)/g,
    (_match, entityId, filename) => {
      const key = `${entityId}/${filename}`
      const mapped = mediaFilenameMap.get(key) || filename
      return `media/${mapped}`
    },
  )
}

function uniqueFilename(name: string, existingNames: Set<string>): string {
  if (!existingNames.has(name)) return name
  const ext = path.extname(name)
  const base = name.slice(0, name.length - ext.length)
  let counter = 2
  while (existingNames.has(`${base}-${counter}${ext}`)) counter++
  return `${base}-${counter}${ext}`
}

export function exportLibraryMarkdown(outputDir: string): { filePath: string; itemCount: number; mediaCopied: number } {
  const { items, itemCount } = buildExportTree()

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  // First pass: collect all media refs and build a flat filename map
  const mediaFilenameMap = new Map<string, string>() // "entityId/filename" → flat filename
  const usedMediaNames = new Set<string>()
  collectAndMapMedia(items, mediaFilenameMap, usedMediaNames)

  // Second pass: write files
  const usedDocNames = new Set<string>()
  writeItems(items, outputDir, mediaFilenameMap, usedDocNames)

  // Copy media files to flat media/ folder
  let mediaCopied = 0
  const mediaDir = path.join(outputDir, 'media')

  for (const [refKey, flatName] of mediaFilenameMap) {
    const [entityId, filename] = refKey.split('/')
    const resolved = resolveMedia({ alt: '', originalUrl: '', entityId, filename })
    if (!resolved) continue

    if (!fs.existsSync(mediaDir)) {
      fs.mkdirSync(mediaDir, { recursive: true })
    }
    fs.copyFileSync(resolved.filePath, path.join(mediaDir, flatName))
    mediaCopied++
  }

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

      const frontmatter = buildFrontmatter(item.tags)
      let body = serializeContentToMarkdown(item.content)
      body = rewriteMediaUrls(body, mediaFilenameMap)

      fs.writeFileSync(path.join(dir, filename), frontmatter + body)
    } else if (item.type === 'collection') {
      const slug = toSlug(item.name)
      const dirName = uniqueFilename(slug, usedNames)
      usedNames.add(dirName)

      const subDir = path.join(dir, dirName)
      if (!fs.existsSync(subDir)) {
        fs.mkdirSync(subDir, { recursive: true })
      }

      const childNames = new Set<string>()
      writeItems(item.children, subDir, mediaFilenameMap, childNames)
    }
  }
}
