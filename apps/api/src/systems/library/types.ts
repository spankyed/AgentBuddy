import type { EARS, BaseEntity } from '@/core/types'

export interface Document extends BaseEntity {
  _type: EARS.Entity.Document
  name: string
  content: string
}

export interface Collection extends BaseEntity {
  _type: EARS.Entity.Collection
  name: string
  description?: string
}

export interface DocumentDTO {
  id: string
  name: string
  content: string
  tags: string[]
  collectionId?: string
  collectionPath?: string[]
  createdAt: string
  updatedAt: string
}

export interface CollectionDTO {
  id: string
  name: string
  description?: string
  parentId?: string
  path: string[]
  documentCount: number
  childCollections: CollectionDTO[]
  createdAt: string
  updatedAt: string
}

export interface LibrarySystemContext {
  documents: DocumentDTO[]
  collections: CollectionDTO[]
  selectedDocumentId?: string
  selectedCollectionId?: string
}