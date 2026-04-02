/**
 * Library utilities for the compiler.
 */

import type { ExportedItem, ContentSection } from '../defs/default-setup-defs'

export function toTitleCase(str: string): string {
  return str
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

/** Count only documents in an item list (used by default compiler). */
export function countDocs(items: ExportedItem[]): number {
  return items.reduce((sum, item) => {
    if (item.type === 'collection') return sum + countDocs(item.children)
    return sum + 1
  }, 0)
}

const SECTION_MARKER_RE = /<!-- section:(\w+)(?::(\w+))? -->\n?/

/** Parse markdown body into typed ContentSection[]. Falls back to single markdown section if no markers. */
export function parseMarkdownSections(body: string): ContentSection[] {
  if (!SECTION_MARKER_RE.test(body)) {
    return [{ type: 'markdown', text: body }]
  }

  const sections: ContentSection[] = []
  const splitRe = /<!-- section:(\w+)(?::(\w+))? -->\n?/g
  const parts: { type: string; param?: string; text: string }[] = []

  let lastIndex = 0
  let match: RegExpExecArray | null
  let prevPart: { type: string; param?: string; text: string } | null = null

  while ((match = splitRe.exec(body)) !== null) {
    if (prevPart) {
      prevPart.text = body.slice(lastIndex, match.index).trim()
      parts.push(prevPart)
    }
    prevPart = { type: match[1], param: match[2], text: '' }
    lastIndex = match.index + match[0].length
  }

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
