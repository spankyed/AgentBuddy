import type { ContentSection } from './types'

export interface ExportedDocument {
  id?: string
  type: 'document'
  name: string
  content: ContentSection[]
  tags: string[]
}

export interface ExportedCollection {
  id?: string
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
