/**
 * Shared Library Utilities
 *
 * Common functions used across library export, import, and scratchpad compilation.
 */

import * as path from 'node:path'
import type { ContentSection } from './types'
import type { ExportedItem } from './export-types'

export function toTitleCase(str: string): string {
  return str
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function uniqueFilename(name: string, existingNames: Set<string>): string {
  if (!existingNames.has(name)) return name
  const ext = path.extname(name)
  const base = name.slice(0, name.length - ext.length)
  let counter = 2
  while (existingNames.has(`${base}-${counter}${ext}`)) counter++
  return `${base}-${counter}${ext}`
}

export function buildFrontmatter(tags: string[]): string {
  if (!tags.length) return ''
  return `---\ntags: [${tags.join(', ')}]\n---\n\n`
}

export function parseFrontmatter(content: string): { tags: string[]; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n\n?/)
  if (!match) return { tags: [], body: content }

  const frontmatter = match[1]
  const body = content.slice(match[0].length)

  // Parse tags: [tag1, tag2] from YAML
  const tagsMatch = frontmatter.match(/tags:\s*\[([^\]]*)\]/)
  const tags = tagsMatch
    ? tagsMatch[1].split(',').map(t => t.trim()).filter(Boolean)
    : []

  return { tags, body }
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

/** Count all items in an export tree (documents, symlinks, collections). */
export function countExportedItems(item: ExportedItem): number {
  if (item.type === 'document' || item.type === 'symlink') return 1
  return 1 + item.children.reduce((sum, child) => sum + countExportedItems(child), 0)
}

/** Count only documents in an item list (used by scratchpad compiler). */
export function countDocs(items: ExportedItem[]): number {
  return items.reduce((sum, item) => {
    if (item.type === 'collection') return sum + countDocs(item.children)
    return sum + 1
  }, 0)
}
