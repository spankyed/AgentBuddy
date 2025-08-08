import { v4 as uuid } from 'uuid'
import { Index } from 'usearch'
import { qx } from '@/core/utils/ears/helpers/query'
import { tx } from '@/core/utils/ears/helpers/transaction'
import { EARS } from '@/core/types'
import type { SearchIndex, SearchIndexConfig, IndexedDocument, IndexSearchResult } from '../types/search-index'
import type { DocumentDTO } from '../types'
import * as searchService from '../services/search-index'
import * as repository from './index'

// In-memory cache for frequently accessed indices
const indexCache = new Map<string, Index>()

/**
 * Helper function to index a single document with its chunks
 * Returns the number of chunks added
 */
async function indexDocumentChunks(
  doc: DocumentDTO,
  indexId: EARS.EntityId,
  searchIndex: SearchIndex,
  index: Index,
  mappings: Map<string, number>,
  startVectorId: number,
  skipExisting: boolean = true
): Promise<number> {
  let vectorId = startVectorId
  let chunksAdded = 0
  
  // Check if we need multi-indexing
  const needsMultiIndex = searchIndex.enableSectionIndexing && 
    searchIndex.segmentRules.some(r => 
      (r.type === 'list' || r.type === 'field') && r.indexMode === 'separate'
    )
  
  if (needsMultiIndex) {
    // Process with multi-indexing
    const chunks = searchService.processDocumentContentMultiIndex(doc.content, searchIndex)
    
    for (const chunk of chunks) {
      // Create unique chunk key
      const chunkKey = chunk.itemIndex !== undefined
        ? `${doc.id}-seg${chunk.segmentIndex}-item${chunk.itemIndex}`
        : `${doc.id}-seg${chunk.segmentIndex}`
      
      // Skip if already indexed and skipExisting is true
      if (skipExisting && mappings.has(chunkKey)) {
        continue
      }
      
      // Generate embedding
      const embeddingResult = await searchService.embedText(chunk.text, searchIndex.embeddingModel)
      
      // Add to index
      index.add(BigInt(vectorId), embeddingResult.embedding)
      
      // Save mapping
      mappings.set(chunkKey, vectorId)
      
      // Save indexed document metadata with chunk info
      const indexedDoc: IndexedDocument = {
        documentId: doc.id as EARS.EntityId,
        vectorId,
        embedding: embeddingResult.embedding,
        text: chunk.text,
        chunkInfo: {
          sourceDocId: doc.id as EARS.EntityId,
          segmentIndex: chunk.segmentIndex,
          itemIndex: chunk.itemIndex,
          totalChunks: chunks.length,
          chunkType: chunk.itemIndex !== undefined ? 'segment-item' : 'full',
          chunkKey
        },
        metadata: {
          shortCode: doc.shortCode,
          name: doc.name,
          indexedAt: Date.now(),
        },
      }
      
      // Store indexed document in EARS
      const indexedDocId = `IndexedDoc-${indexId}-${chunkKey}` as EARS.EntityId
      tx(indexedDocId).updateBatch(indexedDoc as any)
      
      vectorId++
      chunksAdded++
    }
  } else {
    // Original single-document indexing
    const chunkKey = doc.id
    
    // Skip if already indexed and skipExisting is true
    if (skipExisting && mappings.has(chunkKey)) {
      return 0
    }
    
    // Process content
    const text = searchService.processDocumentContent(doc.content, searchIndex)
    
    // Generate embedding
    const embeddingResult = await searchService.embedText(text, searchIndex.embeddingModel)
    
    // Add to index
    index.add(BigInt(vectorId), embeddingResult.embedding)
    
    // Save mapping
    mappings.set(chunkKey, vectorId)
    
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
    
    chunksAdded = 1
  }
  
  return chunksAdded
}

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
  
  // Save metadata and mappings (but not the index yet, as it's empty)
  searchService.saveMetadata(indexId, searchIndex)
  searchService.saveMappings(indexId, new Map())
  
  // Cache the index
  indexCache.set(indexId, index)
  
  // Index documents in the folder (this will save the index after adding documents)
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
    
    // Save metadata and mappings (but not the index yet, as it's empty)
    searchService.saveMetadata(indexId, updatedIndex)
    searchService.saveMappings(indexId, new Map())
    
    // Update cache
    indexCache.set(indexId, index)
    
    // Re-index all documents (this will save the index after adding documents)
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

/**
 * Helper function to remove all chunks for a document
 * Returns true if any chunks were removed
 */
async function removeDocumentChunks(
  documentId: EARS.EntityId,
  indexId: EARS.EntityId,
  index: Index,
  mappings: Map<string, number>
): Promise<boolean> {
  const keysToRemove: string[] = []
  
  for (const [key, _] of mappings) {
    if (key === documentId || key.startsWith(`${documentId}-`)) {
      keysToRemove.push(key)
    }
  }
  
  for (const key of keysToRemove) {
    const vectorId = mappings.get(key)!
    index.remove(BigInt(vectorId))
    mappings.delete(key)
    
    // Delete indexed document from EARS
    const indexedDocId = `IndexedDoc-${indexId}-${key}` as EARS.EntityId
    tx(indexedDocId).destroy()
  }
  
  return keysToRemove.length > 0
}

/**
 * Helper function to update document count and save changes
 */
async function updateIndexDocumentCount(
  indexId: EARS.EntityId,
  searchIndex: SearchIndex,
  mappings: Map<string, number>
): Promise<void> {
  searchIndex.documentCount = mappings.size
  tx(indexId).updateBatch({
    ...searchIndex,
    type: 'SearchIndex',
    documentCount: mappings.size
  })
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
  
  // Load existing mappings - now uses chunk keys instead of doc IDs
  const mappings = searchService.loadMappings(indexId)
  
  // Get documents to index
  const documents = await getDocumentsToIndex(folderId, searchIndex)
  
  let vectorId = mappings.size
  
  for (const doc of documents) {
    await indexDocumentChunks(doc, indexId, searchIndex, index, mappings, vectorId, true)
    vectorId = mappings.size // Update vectorId to the new size after indexing
  }
  
  // Update document count and save
  await updateIndexDocumentCount(indexId, searchIndex, mappings)
  
  // Save index and mappings (only save index if we have documents)
  if (mappings.size > 0) {
    await searchService.saveIndex(index, searchService.getIndexPath(indexId))
  }
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
  
  // Remove old chunks for this document
  await removeDocumentChunks(documentId, indexId, index, mappings)
  
  // Index the document using the helper function (skipExisting = false since we already removed old chunks)
  const vectorId = mappings.size
  await indexDocumentChunks(document, indexId, searchIndex, index, mappings, vectorId, false)
  
  // Update document count and save
  await updateIndexDocumentCount(indexId, searchIndex, mappings)
  
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
  
  // Remove all chunks for this document
  const hasRemovals = await removeDocumentChunks(documentId, indexId, index, mappings)
  
  if (hasRemovals) {
    // Save updated index and mappings
    await searchService.saveIndex(index, searchService.getIndexPath(indexId))
    searchService.saveMappings(indexId, mappings)
    
    // Update document count
    const searchIndex = await getSearchIndex(indexId)
    if (searchIndex) {
      await updateIndexDocumentCount(indexId, searchIndex, mappings)
    }
  }
}

export async function searchInIndex(
  indexId: EARS.EntityId,
  query: string,
  limit: number = 10
): Promise<IndexSearchResult[]> {
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
  
  // Load mappings to get chunk keys
  const mappings = searchService.loadMappings(indexId)
  const reverseMappings = new Map(Array.from(mappings).map(([k, v]) => [v, k]))
  
  // Build search results - deduplicate by document ID
  const searchResultsMap = new Map<string, IndexSearchResult>()
  
  // Handle search results
  if (results.keys && results.distances) {
    const keys = results.keys
    const distances = results.distances
    
    for (let i = 0; i < keys.length; i++) {
      const key = Number(keys[i])
      const distance = distances[i]
      
      const chunkKey = reverseMappings.get(key)
      if (!chunkKey) continue
      
      // Load indexed document metadata
      const indexedDocId = `IndexedDoc-${indexId}-${chunkKey}` as EARS.EntityId
      const indexedDocs = qx(indexedDocId).pickAll()
      const indexedDoc = indexedDocs[0] as unknown as IndexedDocument
      
      if (indexedDoc) {
        const docId = indexedDoc.documentId
        
        // If we already have a result for this document, keep the best score
        const existing = searchResultsMap.get(docId)
        if (!existing || distance > existing.score) {
          searchResultsMap.set(docId, {
            documentId: docId,
            score: distance,
            text: indexedDoc.text,
            metadata: indexedDoc.metadata,
          })
        }
      }
    }
  }
  
  // Convert map to array and sort by score
  const searchResults = Array.from(searchResultsMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
  
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
  
  // Save mappings (but not the index yet, as it's empty)
  searchService.saveMappings(indexId, new Map())
  
  // Update cache
  indexCache.set(indexId, index)
  
  // Re-index all documents (this will save the index after adding documents)
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