/**
 * Library export types – Vendored from AgentBuddy
 * Source: packages/api/src/systems/library/export-types.ts
 */

import type { ContentSection } from './library-types'

export interface ExportedDocument {
  type: 'document'
  name: string
  content: ContentSection[]
  tags: string[]
}

export interface ExportedCollection {
  type: 'collection'
  name: string
  description?: string
  children: ExportedItem[]
}

export interface ExportedSymlink {
  type: 'symlink'
  name: string
  symlinkPath: string
}

export type ExportedItem = ExportedDocument | ExportedCollection | ExportedSymlink

export interface ExportedLibrary {
  version: number
  items: ExportedItem[]
}

export type ExportFormat = 'markdown' | 'json'
