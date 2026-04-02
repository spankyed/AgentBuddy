/**
 * Library utilities for the compiler.
 */

import type { ExportedItem } from '../defs/default-setup-defs'

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
