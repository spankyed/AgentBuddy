/**
 * Shared Export Utilities
 *
 * Common functions used across multiple system export files.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

const INTERNAL_FIELDS = ['id', 'entityType', 'createdAt', 'updatedAt', 'deleted', 'deletedAt'] as const

export function stripInternalFields<T extends object>(items: T[]): Record<string, unknown>[] {
  return items.map(item => {
    const copy = { ...item } as Record<string, unknown>
    for (const field of INTERNAL_FIELDS) {
      delete copy[field]
    }
    return copy
  })
}

export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function writeExportJson(outputDir: string, filename: string, data: unknown): string {
  return writeExportFile(outputDir, filename, JSON.stringify(data, null, 2))
}

export function writeExportFile(dir: string, filename: string, content: string): string {
  const filePath = path.join(dir, filename)
  fs.writeFileSync(filePath, content)
  return filePath
}

export function uniqueFilename(name: string, existingNames: Set<string>): string {
  if (!existingNames.has(name)) return name
  const ext = path.extname(name)
  const base = name.slice(0, name.length - ext.length)
  let counter = 2
  while (existingNames.has(`${base}-${counter}${ext}`)) counter++
  return `${base}-${counter}${ext}`
}
