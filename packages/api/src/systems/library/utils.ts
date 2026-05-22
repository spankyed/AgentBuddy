/**
 * Shared Library Utilities
 *
 * Common functions used across library export, import, and default-setup compilation.
 */

import type { ContentSection } from './types'
import type { ExportedItem } from './export-types'

export { toSlug, uniqueFilename } from '@/core/shared/export'

export function toDisplayName(str: string): string {
  return str.replace(/-/g, ' ')
}

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

export function serializeContentToMarkdown(sections: ContentSection[]): string {
  const parts: string[] = []

  for (const section of sections) {
    switch (section.type) {
      case 'markdown':
        parts.push(`<!-- section:markdown -->\n${section.text}`)
        break
      case 'text':
        parts.push(`<!-- section:text -->\n${section.text}`)
        break
      case 'code':
        parts.push(`<!-- section:code:${section.language} -->\n\`\`\`${section.language}\n${section.text}\n\`\`\``)
        break
      case 'field':
        parts.push(
          `<!-- section:field -->\n` +
          section.fields.map(f => `**${f.key}**: ${f.value}`).join('\n')
        )
        break
      case 'list':
        parts.push(
          `<!-- section:list -->\n` +
          section.items.map(item => `- ${item}`).join('\n')
        )
        break
    }
  }

  return parts.join('\n\n')
}

const SECTION_MARKER_RE = /<!-- section:(\w+)(?::(\w+))? -->\n?/

export function parseMarkdownSections(body: string): ContentSection[] {
  // Backward compat: no markers → single markdown section
  if (!SECTION_MARKER_RE.test(body)) {
    return [{ type: 'markdown', text: body }]
  }

  const sections: ContentSection[] = []
  // Split on markers, capturing type and optional param
  const splitRe = /<!-- section:(\w+)(?::(\w+))? -->\n?/g
  const parts: { type: string; param?: string; text: string }[] = []

  let lastIndex = 0
  let match: RegExpExecArray | null
  let prevPart: { type: string; param?: string; text: string } | null = null

  while ((match = splitRe.exec(body)) !== null) {
    // Any text before the first marker (or between markers) belongs to the previous part
    if (prevPart) {
      prevPart.text = body.slice(lastIndex, match.index).trim()
      parts.push(prevPart)
    }
    prevPart = { type: match[1], param: match[2], text: '' }
    lastIndex = match.index + match[0].length
  }

  // Last section gets remaining text
  if (prevPart) {
    prevPart.text = body.slice(lastIndex).trim()
    parts.push(prevPart)
  }

  for (const part of parts) {
    if (!part.text) continue

    switch (part.type) {
      case 'field': {
        const fields: { key: string; value: string }[] = []
        for (const line of part.text.split('\n')) {
          const m = line.match(/^\*\*(.+?)\*\*:\s*(.*)$/)
          if (m) fields.push({ key: m[1], value: m[2] })
        }
        if (fields.length) sections.push({ type: 'field', fields })
        break
      }
      case 'list': {
        const items = part.text.split('\n')
          .filter(l => l.startsWith('- '))
          .map(l => l.slice(2))
        if (items.length) sections.push({ type: 'list', items })
        break
      }
      case 'code': {
        const language = part.param || ''
        // Strip code fence if present
        const fenceRe = /^```\w*\n([\s\S]*?)\n```$/
        const fenceMatch = part.text.match(fenceRe)
        const text = fenceMatch ? fenceMatch[1] : part.text
        sections.push({ type: 'code', language, text })
        break
      }
      case 'text':
        sections.push({ type: 'text', text: part.text })
        break
      case 'markdown':
      default:
        sections.push({ type: 'markdown', text: part.text })
        break
    }
  }

  return sections
}

/** Count all items in an export tree (documents, symlinks, collections). */
export function countExportedItems(item: ExportedItem): number {
  if (item.type === 'document' || item.type === 'symlink') return 1
  return 1 + item.children.reduce((sum, child) => sum + countExportedItems(child), 0)
}

/** Count only documents in an item list (used by default-setup compiler). */
export function countDocs(items: ExportedItem[]): number {
  return items.reduce((sum, item) => {
    if (item.type === 'collection') return sum + countDocs(item.children)
    return sum + 1
  }, 0)
}
