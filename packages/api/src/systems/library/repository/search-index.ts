import { v4 as uuid } from 'uuid'
import { Index } from 'usearch'
import { qx } from '@/core/utils/ears/helpers/query'
import { tx } from '@/core/utils/ears/helpers/transaction'
import { EARS } from '@/core/types'
import type { SearchIndex, SearchIndexConfig, IndexedDocument, SearchResult } from '../types/search-index'
import type { DocumentDTO } from '../types'
import * as searchService from '../services/search-index'
import * as repository from './index'

// In-memory cache for frequently accessed indices
const indexCache = new Map<string, Index>()

export async function createSearchIndex(
  config: SearchIndexConfig,
  folderId: EARS.EntityId | null
): Promise<SearchIndex> {
  const indexId = `SearchIndex-${uuid()}` as EARS.EntityId
  const now = Date.now()
  
  const searchIndex: SearchIndex = {
    ...config,
    id: indexId,
    folderId,
    documentCount: 0,
    vectorDimensions: searchService.getVectorDimensions(config.embeddingModel),
    createdAt: now,
    updatedAt: now,
  }
  
  // Save to EARS
  tx(indexId).updateBatch({
    ...searchIndex,
    type: 'SearchIndex',
  })
  
  // Create USearch index
  const index = searchService.createIndex(config)
  
  // Save metadata and empty index to disk
  searchService.saveMetadata(indexId, searchIndex)
  await searchService.saveIndex(index, searchService.getIndexPath(indexId))
  searchService.saveMappings(indexId, new Map())
  
  // Cache the index
  indexCache.set(indexId, index)
  
  // Index documents in the folder
  await indexDocumentsInFolder(indexId, folderId)
  
  return searchIndex
}

export async function getSearchIndex(indexId: EARS.EntityId): Promise<SearchIndex | null> {
  const indices = qx(indexId).pickAll()
  const indexData = indices[0]
  
  if (!indexData || indexData.type !== 'SearchIndex') {
    return null
  }
  
  return indexData as unknown as SearchIndex
}

export async function getSearchIndicesForFolder(folderId: EARS.EntityId | null): Promise<SearchIndex[]> {
  const allIndices = qx(EARS.Entity.SearchIndex)
    .where('folderId', folderId)
    .pickAll()
  
  return allIndices as unknown as SearchIndex[]
}

export async function updateSearchIndex(
  indexId: EARS.EntityId,
  config: SearchIndexConfig
): Promise<SearchIndex> {
  const existingIndex = await getSearchIndex(indexId)
  if (!existingIndex) {
    throw new Error(`Search index ${indexId} not found`)
  }
  
  const now = Date.now()
  const updatedIndex: SearchIndex = {
    ...config,
    id: indexId,
    folderId: existingIndex.folderId,
    documentCount: existingIndex.documentCount,
    vectorDimensions: searchService.getVectorDimensions(config.embeddingModel),
    createdAt: existingIndex.createdAt,
    updatedAt: now,
  }
  
  // Update in EARS
  tx(indexId).updateBatch({
    ...updatedIndex,
  })
  
  // If embedding model changed, we need to re-index everything
  if (existingIndex.embeddingModel !== config.embeddingModel ||
      existingIndex.indexMetric !== config.indexMetric ||
      existingIndex.connectors !== config.connectors) {
    
    // Delete old index files
    searchService.deleteIndexFiles(indexId)
    
    // Create new index
    const index = searchService.createIndex(config)
    
    // Save metadata and empty index
    searchService.saveMetadata(indexId, updatedIndex)
    await searchService.saveIndex(index, searchService.getIndexPath(indexId))
    searchService.saveMappings(indexId, new Map())
    
    // Update cache
    indexCache.set(indexId, index)
    
    // Re-index all documents
    await indexDocumentsInFolder(indexId, existingIndex.folderId)
  } else {
    // Just update metadata
    searchService.saveMetadata(indexId, updatedIndex)
    
    // Re-process documents if section rules changed
    if (JSON.stringify(existingIndex.segmentRules) !== JSON.stringify(config.segmentRules) ||
        existingIndex.constructTemplate !== config.constructTemplate ||
        existingIndex.enableSectionIndexing !== config.enableSectionIndexing) {
      await reindexAllDocuments(indexId)
    }
  }
  
  return updatedIndex
}

export async function deleteSearchIndex(indexId: EARS.EntityId): Promise<void> {
  // Remove from cache
  indexCache.delete(indexId)
  
  // Delete files
  searchService.deleteIndexFiles(indexId)
  
  // Delete from EARS
  tx(indexId).destroy()
}

export async function indexDocumentsInFolder(
  indexId: EARS.EntityId,
  folderId: EARS.EntityId | null
): Promise<void> {
  const searchIndex = await getSearchIndex(indexId)
  if (!searchIndex) {
    throw new Error(`Search index ${indexId} not found`)
  }
  
  // Get or load the index
  let index = indexCache.get(indexId)
  if (!index) {
    index = await searchService.loadIndex(searchService.getIndexPath(indexId), searchIndex)
    indexCache.set(indexId, index)
  }
  
  // Load existing mappings
  const mappings = searchService.loadMappings(indexId)
  
  // Get documents to index
  const documents = await getDocumentsToIndex(folderId, searchIndex)
  
  let vectorId = mappings.size
  
  for (const doc of documents) {
    // Skip if already indexed
    if (mappings.has(doc.id)) {
      continue
    }
    
    // Process content
    const text = searchService.processDocumentContent(doc.content, searchIndex)
    
    // Generate embedding
    const embeddingResult = await searchService.embedText(text, searchIndex.embeddingModel)
    
    // Add to index
    index.add(BigInt(vectorId), embeddingResult.embedding)
    
    // Save mapping
    mappings.set(doc.id, vectorId)
    
    // Save indexed document metadata
    const indexedDoc: IndexedDocument = {
      documentId: doc.id as EARS.EntityId,
      vectorId,
      embedding: embeddingResult.embedding,
      text,
      metadata: {
        shortCode: doc.shortCode,
        name: doc.name,
        indexedAt: Date.now(),
      },
    }
    
    // Store indexed document in EARS
    const indexedDocId = `IndexedDoc-${indexId}-${doc.id}` as EARS.EntityId
    tx(indexedDocId).updateBatch(indexedDoc as any)
    
    vectorId++
  }
  
  // Update document count
  searchIndex.documentCount = mappings.size
  tx(indexId).put('documentCount', searchIndex.documentCount)
  
  // Save index and mappings
  await searchService.saveIndex(index, searchService.getIndexPath(indexId))
  searchService.saveMappings(indexId, mappings)
  searchService.saveMetadata(indexId, searchIndex)
}

export async function indexDocument(
  documentId: EARS.EntityId,
  indexId: EARS.EntityId
): Promise<void> {
  const searchIndex = await getSearchIndex(indexId)
  if (!searchIndex) {
    throw new Error(`Search index ${indexId} not found`)
  }
  
  const document = await repository.getDocument(documentId)
  if (!document) {
    throw new Error(`Document ${documentId} not found`)
  }
  
  // Check if document should be indexed
  if (searchIndex.excludedDocumentIds.includes(documentId)) {
    return
  }
  
  // Get or load the index
  let index = indexCache.get(indexId)
  if (!index) {
    index = await searchService.loadIndex(searchService.getIndexPath(indexId), searchIndex)
    indexCache.set(indexId, index)
  }
  
  // Load existing mappings
  const mappings = searchService.loadMappings(indexId)
  
  // Remove old vector if exists
  if (mappings.has(documentId)) {
    const oldVectorId = mappings.get(documentId)!
    index.remove(BigInt(oldVectorId))
  }
  
  // Process content
  const text = searchService.processDocumentContent(document.content, searchIndex)
  
  // Generate embedding
  const embeddingResult = await searchService.embedText(text, searchIndex.embeddingModel)
  
  // Add to index with new vector ID
  const vectorId = mappings.size
  index.add(BigInt(vectorId), embeddingResult.embedding)
  
  // Update mapping
  mappings.set(documentId, vectorId)
  
  // Save indexed document metadata
  const indexedDoc: IndexedDocument = {
    documentId,
    vectorId,
    embedding: embeddingResult.embedding,
    text,
    metadata: {
      shortCode: document.shortCode,
      name: document.name,
      indexedAt: Date.now(),
    },
  }
  
  // Store indexed document in EARS
  const indexedDocId = `IndexedDoc-${indexId}-${documentId}` as EARS.EntityId
  tx(indexedDocId).updateBatch(indexedDoc as any)
  
  // Update document count
  searchIndex.documentCount = mappings.size
  tx(indexId).put('documentCount', searchIndex.documentCount)
  
  // Save index and mappings
  await searchService.saveIndex(index, searchService.getIndexPath(indexId))
  searchService.saveMappings(indexId, mappings)
}

export async function removeDocumentFromIndex(
  documentId: EARS.EntityId,
  indexId: EARS.EntityId
): Promise<void> {
  // Get or load the index
  let index = indexCache.get(indexId)
  if (!index) {
    const searchIndex = await getSearchIndex(indexId)
    if (!searchIndex) return
    
    index = await searchService.loadIndex(searchService.getIndexPath(indexId), searchIndex)
    indexCache.set(indexId, index)
  }
  
  // Load existing mappings
  const mappings = searchService.loadMappings(indexId)
  
  // Remove vector if exists
  if (mappings.has(documentId)) {
    const vectorId = mappings.get(documentId)!
    index.remove(BigInt(vectorId))
    mappings.delete(documentId)
    
    // Delete indexed document from EARS
    const indexedDocId = `IndexedDoc-${indexId}-${documentId}` as EARS.EntityId
    tx(indexedDocId).destroy()
    
    // Save updated index and mappings
    await searchService.saveIndex(index, searchService.getIndexPath(indexId))
    searchService.saveMappings(indexId, mappings)
    
    // Update document count
    const searchIndex = await getSearchIndex(indexId)
    if (searchIndex) {
      searchIndex.documentCount = mappings.size
      tx(indexId).put('documentCount', searchIndex.documentCount)
    }
  }
}

export async function searchInIndex(
  indexId: EARS.EntityId,
  query: string,
  limit: number = 10
): Promise<SearchResult[]> {
  const searchIndex = await getSearchIndex(indexId)
  if (!searchIndex) {
    throw new Error(`Search index ${indexId} not found`)
  }
  
  // Get or load the index
  let index = indexCache.get(indexId)
  if (!index) {
    index = await searchService.loadIndex(searchService.getIndexPath(indexId), searchIndex)
    indexCache.set(indexId, index)
  }
  
  // Embed the query
  const queryEmbedding = await searchService.embedText(query, searchIndex.embeddingModel)
  
  // Search
  const results = index.search(queryEmbedding.embedding, limit)
  
  // Load mappings to get document IDs
  const mappings = searchService.loadMappings(indexId)
  const reverseMappings = new Map(Array.from(mappings).map(([k, v]) => [v, k]))
  
  // Build search results
  const searchResults: SearchResult[] = []
  
  // Handle search results
  if (results.keys && results.distances) {
    const keys = results.keys
    const distances = results.distances
    
    for (let i = 0; i < keys.length; i++) {
      const key = Number(keys[i])
      const distance = distances[i]
      
      const documentId = reverseMappings.get(key)
      if (!documentId) continue
      
      // Load indexed document metadata
      const indexedDocId = `IndexedDoc-${indexId}-${documentId}` as EARS.EntityId
      const indexedDocs = qx(indexedDocId).pickAll()
      const indexedDoc = indexedDocs[0] as unknown as IndexedDocument
      
      if (indexedDoc) {
        searchResults.push({
          documentId: documentId as EARS.EntityId,
          score: distance,
          text: indexedDoc.text,
          metadata: indexedDoc.metadata,
        })
      }
    }
  }
  
  return searchResults
}

async function getDocumentsToIndex(
  folderId: EARS.EntityId | null,
  searchIndex: SearchIndex
): Promise<DocumentDTO[]> {
  let documents: DocumentDTO[] = []
  
  if (folderId === null) {
    // Root folder - get all documents not in any collection
    documents = await repository.getDocuments()
    documents = documents.filter(doc => !doc.collectionId)
  } else {
    // Get documents in this folder
    documents = await repository.getDocumentsInCollection(folderId)
    
    // If not excluding subfolders, also get documents from child collections
    if (!searchIndex.excludeAllSubfolders) {
      const childCollections = await getChildCollectionsRecursive(folderId)
      for (const childId of childCollections) {
        if (!searchIndex.excludedFolderIds.includes(childId)) {
          const childDocs = await repository.getDocumentsInCollection(childId)
          documents = documents.concat(childDocs)
        }
      }
    }
  }
  
  // Filter out excluded documents
  documents = documents.filter(doc => 
    !searchIndex.excludedDocumentIds.includes(doc.id as EARS.EntityId)
  )
  
  return documents
}

async function getChildCollectionsRecursive(
  collectionId: EARS.EntityId
): Promise<EARS.EntityId[]> {
  const children = qx(collectionId)
    .linksTo(EARS.RelKind.PARENT_OF, 'Collection' as any)
    .ids()
  
  const allChildren = [...children]
  
  for (const childId of children) {
    const grandChildren = await getChildCollectionsRecursive(childId)
    allChildren.push(...grandChildren)
  }
  
  return allChildren
}

async function reindexAllDocuments(indexId: EARS.EntityId): Promise<void> {
  const searchIndex = await getSearchIndex(indexId)
  if (!searchIndex) return
  
  // Clear existing index
  searchService.deleteIndexFiles(indexId)
  indexCache.delete(indexId)
  
  // Create new index
  const index = searchService.createIndex(searchIndex)
  
  // Save empty index
  await searchService.saveIndex(index, searchService.getIndexPath(indexId))
  searchService.saveMappings(indexId, new Map())
  
  // Update cache
  indexCache.set(indexId, index)
  
  // Re-index all documents
  await indexDocumentsInFolder(indexId, searchIndex.folderId)
}

// Auto-index new documents in folders with indices
export async function autoIndexNewDocument(documentId: EARS.EntityId): Promise<void> {
  const document = await repository.getDocument(documentId)
  if (!document) return
  
  // Find all indices that should include this document
  const allIndices = qx(EARS.Entity.SearchIndex).pickAll()
  
  for (const indexData of allIndices) {
    const searchIndex = indexData as unknown as SearchIndex
    
    // Check if document is in the index's folder scope
    if (searchIndex.folderId === null) {
      // Root index - only index if document is not in any collection
      if (!document.collectionId) {
        await indexDocument(documentId, searchIndex.id)
      }
    } else if (document.collectionId === searchIndex.folderId) {
      // Document is directly in the index's folder
      await indexDocument(documentId, searchIndex.id)
    } else if (!searchIndex.excludeAllSubfolders) {
      // Check if document is in a subfolder
      const childCollections = await getChildCollectionsRecursive(searchIndex.folderId)
      if (document.collectionId && childCollections.includes(document.collectionId as EARS.EntityId)) {
        if (!searchIndex.excludedFolderIds.includes(document.collectionId as EARS.EntityId)) {
          await indexDocument(documentId, searchIndex.id)
        }
      }
    }
  }
}

// Remove document from all indices when deleted
export async function removeDocumentFromAllIndices(documentId: EARS.EntityId): Promise<void> {
  const allIndices = qx(EARS.Entity.SearchIndex).pickAll()
  
  for (const indexData of allIndices) {
    const searchIndex = indexData as unknown as SearchIndex
    await removeDocumentFromIndex(documentId, searchIndex.id)
  }
}