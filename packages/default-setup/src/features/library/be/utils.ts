/**
 * Shared Library Utilities
 *
 * Common functions used across library export and import.
 */

import type { ExportedItem } from '#features/library/be/export-types.ts';


function escapeQuotes(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

export function buildFrontmatter(tags: string[], name?: string, id?: string): string {
  const fields: string[] = []
  if (id) fields.push(`id: "${escapeQuotes(id)}"`)
  if (name) fields.push(`name: "${escapeQuotes(name)}"`)
  if (tags.length) fields.push(`tags: [${tags.join(', ')}]`)
  if (!fields.length) return ''
  return `---\n${fields.join('\n')}\n---\n\n`
}

export function parseFrontmatter(content: string): { tags: string[]; id?: string; name?: string; description?: string; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n\n?/)
  if (!match) return { tags: [], body: content }

  const frontmatter = match[1]
  const body = content.slice(match[0].length)

  const tagsMatch = frontmatter.match(/tags:\s*\[([^\]]*)\]/)
  const tags = tagsMatch
    ? tagsMatch[1].split(',').map(t => t.trim()).filter(Boolean)
    : []

  const idMatch = frontmatter.match(/id:\s*"((?:[^"\\]|\\.)*)"/)
  const id = idMatch?.[1]?.replace(/\\"/g, '"').replace(/\\\\/g, '\\')

  const nameMatch = frontmatter.match(/name:\s*"((?:[^"\\]|\\.)*)"/)
  const name = nameMatch?.[1]?.replace(/\\"/g, '"').replace(/\\\\/g, '\\')

  const descMatch = frontmatter.match(/description:\s*"((?:[^"\\]|\\.)*)"/)
  const description = descMatch?.[1]?.replace(/\\"/g, '"').replace(/\\\\/g, '\\')

  return { tags, id, name, description, body }
}

/** Count all items in an export tree (documents, symlinks, collections). */
export function countExportedItems(item: ExportedItem): number {
  if (item.type === 'document' || item.type === 'symlink') return 1
  return 1 + item.children.reduce((sum, child) => sum + countExportedItems(child), 0)
}

