import { Index } from 'usearch'
import { qx } from '@/core/ears/helpers/query'
import { tx } from '@/core/ears/helpers/transaction'
import { EARS } from '@/core/types'
import { randomId } from '@/core/shared/random-id'
import { createLogger } from '@/core/shared/debug/logger'
import type {
  SearchIndex,
  SearchIndexConfig,
  IndexedDocument,
  IndexSearchResult,
  ChunkInfo,
  IndexedDocEntity,
  IndexedDocCreateData,
  IndexedDocUpdateData
} from './types/search-index'
import type { DocumentDTO } from '@/systems/library/types'
import * as searchService from './service'
import { libraryQueries, libraryCommands } from '@/systems/library/repository'

const logger = createLogger('search-index')

// In-memory cache for frequently accessed indices
const indexCache = new Map<string, Index>()

// Helper functions for IndexedDoc management
function generateIndexedDocShortCode(): string {
  // Use collision-resistant ID generation
  return `IDOC-${randomId({ length: 8, counterSafe: true })}`
}

function findIndexedDoc(indexId: string, chunkKey: string): IndexedDocEntity | null {
  const results = qx(EARS.Entity.IndexedDoc)
    .where('indexId', indexId)
    .where('chunkKey', chunkKey)
    .pickAll()
  
  if (results.length === 0) return null
  
  // Convert to typed entity
  return results[0] as unknown as IndexedDocEntity
}

function createIndexedDoc(data: IndexedDocCreateData): EARS.EntityId {
  const id = tx(EARS.Entity.IndexedDoc)
    .put('shortCode', generateIndexedDocShortCode())
    .put('indexId', data.indexId)
    .put('chunkKey', data.chunkKey)
    .put('documentId', data.documentId)
    .put('vectorId', data.vectorId)
    .put('text', data.text)
    .put('metadata', data.metadata)
    .put('chunkInfo', data.chunkInfo || null)
    .id()
  return id
}

function updateIndexedDoc(entityId: EARS.EntityId, data: IndexedDocUpdateData): void {
  tx(entityId).updateBatch(data as Record<string, unknown>)
}

function deleteIndexedDocsForIndex(indexId: string): void {
  const docs = qx(EARS.Entity.IndexedDoc)
    .where('indexId', indexId)
    .ids()
  
  docs.forEach(id => tx(id).destroy())
}

// Helper to build chunk metadata
function buildChunkMetadata(doc: DocumentDTO, indexedAt: number) {
  return {
    shortCode: doc.shortCode,
    name: doc.name,
    indexedAt
  }
}

// Helper to build chunk info
function buildChunkInfo(
  docId: EARS.EntityId,
  chunkKey: string,
  segmentIndex?: number,
  itemIndex?: number
): ChunkInfo | undefined {
  if (segmentIndex === undefined) return undefined
  
  return {
    sourceDocId: docId,
    segmentIndex,
    itemIndex,
    totalChunks: 0, // This should be calculated elsewhere if needed
    chunkType: itemIndex !== undefined ? 'segment-item' : 'full',
    chunkKey
  }
}

/**
 * Index documents in batch for optimal performance
 */
async function indexDocumentsBatch(
  docs: DocumentDTO[],
  indexId: EARS.EntityId,
  searchIndex: SearchIndex,
  index: Index,
  mappings: Map<string, number>,
  startVectorId: number,
  skipExisting = true
): Promise<number> {
  // Prepare all chunks
  const chunks: Array<{
    doc: DocumentDTO
    key: string
    text: string
    segmentIndex?: number
    itemIndex?: number
  }> = []
  
  const needsMultiIndex = searchIndex.enableSectionIndexing && 
    searchIndex.segmentRules.some(r => 
      (r.type === 'list' || r.type === 'field') && r.indexMode === 'separate'
    )
  
  for (const doc of docs) {
    if (needsMultiIndex) {
      const processed = searchService.processDocumentContentMultiIndex(doc.content, searchIndex)
      for (const chunk of processed) {
        const key = chunk.itemIndex !== undefined
          ? `${doc.id}-seg${chunk.segmentIndex}-item${chunk.itemIndex}`
          : `${doc.id}-seg${chunk.segmentIndex}`
        
        if (!skipExisting || !mappings.has(key)) {
          chunks.push({ 
            doc, 
            key, 
            text: chunk.text, 
            segmentIndex: chunk.segmentIndex,
            itemIndex: chunk.itemIndex 
          })
        }
      }
    } else {
      if (!skipExisting || !mappings.has(doc.id)) {
        chunks.push({
          doc,
          key: doc.id,
          text: searchService.processDocumentContent(doc.content, searchIndex)
        })
      }
    }
  }
  
  if (!chunks.length) return 0

  // Batch embed all texts
  let embeddings
  try {
    embeddings = await searchService.embedTextsBatch(
      chunks.map(c => c.text),
      searchIndex.embeddingModel
    )
  } catch (error) {
    logger.error('Failed to generate embeddings for documents', {
      error: error instanceof Error ? error.message : String(error),
      modelId: searchIndex.embeddingModel,
      chunkCount: chunks.length
    })
    throw new Error(`Failed to generate embeddings: ${error instanceof Error ? error.message : String(error)}`)
  }

  // Prepare batch insertion arrays
  const dim = embeddings[0].embedding.length
  const keys = new BigUint64Array(chunks.length)
  const vectors = new Float32Array(chunks.length * dim)
  const indexedAt = Date.now()
  
  // Process chunks and prepare for insertion
  chunks.forEach((chunk, i) => {
    const id = startVectorId + i
    keys[i] = BigInt(id)
    vectors.set(embeddings[i].embedding, i * dim)
    mappings.set(chunk.key, id)

    // Store metadata - check if IndexedDoc already exists
    const existing = findIndexedDoc(indexId, chunk.key)
    if (existing) {
      // Update existing IndexedDoc
      updateIndexedDoc(existing.id, {
        documentId: chunk.doc.id as EARS.EntityId,
        vectorId: id,
        text: chunk.text,
        metadata: buildChunkMetadata(chunk.doc, indexedAt),
        chunkInfo: buildChunkInfo(
          chunk.doc.id as EARS.EntityId,
          chunk.key,
          chunk.segmentIndex,
          chunk.itemIndex
        )
      })
    } else {
      // Create new IndexedDoc entity
      createIndexedDoc({
        indexId,
        chunkKey: chunk.key,
        documentId: chunk.doc.id as EARS.EntityId,
        vectorId: id,
        text: chunk.text,
        metadata: buildChunkMetadata(chunk.doc, indexedAt),
        chunkInfo: buildChunkInfo(
          chunk.doc.id as EARS.EntityId,
          chunk.key,
          chunk.segmentIndex,
          chunk.itemIndex
        )
      })
    }
  })

  // Batch insert to index
  if (chunks.length > 0) {
    index.add(keys, vectors)
  }
  
  return chunks.length
}

/**
 * Remove all chunks for a document and return true if any were removed
 */
function removeDocumentChunks(
  documentId: EARS.EntityId,
  indexId: EARS.EntityId,
  index: Index,
  mappings: Map<string, number>
): boolean {
  const keysToRemove = Array.from(mappings.keys())
    .filter(key => key === documentId || key.startsWith(`${documentId}-`))
  
  keysToRemove.forEach(key => {
    index.remove(BigInt(mappings.get(key)!))
    mappings.delete(key)
    // Find and destroy the IndexedDoc entity
    const indexedDoc = findIndexedDoc(indexId, key)
    if (indexedDoc) {
      tx(indexedDoc.id).destroy()
    }
  })
  
  return keysToRemove.length > 0
}

export async function createSearchIndex(
  config: SearchIndexConfig,
  folderId: EARS.EntityId | null
): Promise<SearchIndex> {
  const now = Date.now()

  // Create SearchIndex entity with auto-generated ID
  const builder = tx(EARS.Entity.SearchIndex)
  const indexId = builder.id()

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
  builder.updateBatch({
    ...searchIndex,
    type: 'SearchIndex',
  })
  
  // Create USearch index
  const index = searchService.createIndex(config)
  
  // Save metadata and mappings
  searchService.saveMetadata(indexId, searchIndex)
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
    
    // Clean up all old IndexedDoc entities before changing model
    deleteIndexedDocsForIndex(indexId)
    
    // Delete old index files
    searchService.deleteIndexFiles(indexId)
    
    // Create new index
    const index = searchService.createIndex(config)
    
    // Save metadata and mappings
    searchService.saveMetadata(indexId, updatedIndex)
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
  // Clean up all IndexedDoc entities for this index
  deleteIndexedDocsForIndex(indexId)
  
  // Remove from cache
  indexCache.delete(indexId)
  
  // Delete index files from disk
  searchService.deleteIndexFiles(indexId)
  
  // Destroy the SearchIndex entity
  tx(indexId).destroy()
}

export async function indexDocumentsInFolder(
  indexId: EARS.EntityId,
  folderId: EARS.EntityId | null
): Promise<void> {
  const searchIndex = await getSearchIndex(indexId)
  if (!searchIndex) throw new Error(`Search index ${indexId} not found`)
  
  // Get or create index
  let index = indexCache.get(indexId)
  if (!index) {
    index = await searchService.loadIndex(searchService.getIndexPath(indexId), searchIndex)
    indexCache.set(indexId, index)
  }
  
  const mappings = searchService.loadMappings(indexId)
  const documents = await getDocumentsToIndex(folderId, searchIndex)
  
  if (!documents.length) return
  
  // Process in batches
  const BATCH_SIZE = 50
  for (let i = 0; i < documents.length; i += BATCH_SIZE) {
    await indexDocumentsBatch(
      documents.slice(i, i + BATCH_SIZE),
      indexId,
      searchIndex,
      index,
      mappings,
      mappings.size
    )
  }
  
  // Update and save
  searchIndex.documentCount = mappings.size
  tx(indexId).updateBatch({ ...searchIndex, type: 'SearchIndex', documentCount: mappings.size })
  
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
  if (!searchIndex) throw new Error(`Search index ${indexId} not found`)

  const document = libraryQueries.getDocument(documentId)
  if (!document) throw new Error(`Document ${documentId} not found`)

  if (searchIndex.excludedDocumentIds.includes(documentId)) return

  // Get or load index
  let index = indexCache.get(indexId)
  if (!index) {
    index = await searchService.loadIndex(searchService.getIndexPath(indexId), searchIndex)
    indexCache.set(indexId, index)
  }

  const mappings = searchService.loadMappings(indexId)

  // Remove old chunks first
  removeDocumentChunks(documentId, indexId, index, mappings)

  // Calculate next vector ID - handle empty mappings case
  const nextVectorId = mappings.size === 0 ? 0 : Math.max(...Array.from(mappings.values())) + 1

  // Reindex with the new vector ID
  await indexDocumentsBatch([document], indexId, searchIndex, index, mappings, nextVectorId, false)

  // Update and save
  searchIndex.documentCount = mappings.size
  tx(indexId).updateBatch({ ...searchIndex, type: 'SearchIndex', documentCount: mappings.size })

  await searchService.saveIndex(index, searchService.getIndexPath(indexId))
  searchService.saveMappings(indexId, mappings)
}

export async function removeDocumentFromIndex(
  documentId: EARS.EntityId,
  indexId: EARS.EntityId
): Promise<void> {
  const searchIndex = await getSearchIndex(indexId)
  if (!searchIndex) return
  
  let index = indexCache.get(indexId)
  if (!index) {
    index = await searchService.loadIndex(searchService.getIndexPath(indexId), searchIndex)
    indexCache.set(indexId, index)
  }
  
  const mappings = searchService.loadMappings(indexId)
  
  if (removeDocumentChunks(documentId, indexId, index, mappings)) {
    await searchService.saveIndex(index, searchService.getIndexPath(indexId))
    searchService.saveMappings(indexId, mappings)
    
    searchIndex.documentCount = mappings.size
    tx(indexId).updateBatch({ ...searchIndex, type: 'SearchIndex', documentCount: mappings.size })
  }
}

export async function searchInIndex(
  indexId: EARS.EntityId,
  query: string,
  limit: number = 10
): Promise<IndexSearchResult[]> {
  const searchIndex = await getSearchIndex(indexId)
  if (!searchIndex) throw new Error(`Search index ${indexId} not found`)
  
  // Get or load the index
  let index = indexCache.get(indexId)
  if (!index) {
    index = await searchService.loadIndex(searchService.getIndexPath(indexId), searchIndex)
    indexCache.set(indexId, index)
  }

  // Embed the query
  let queryEmbedding
  try {
    queryEmbedding = await searchService.embedText(query, searchIndex.embeddingModel)
  } catch (error) {
    logger.error('Failed to generate embedding for search query', {
      error: error instanceof Error ? error.message : String(error),
      modelId: searchIndex.embeddingModel,
      query
    })
    throw new Error(`Failed to generate search query embedding: ${error instanceof Error ? error.message : String(error)}`)
  }

  // Search
  const results = index.search(queryEmbedding.embedding, limit)
  
  // Load mappings to get chunk keys
  const mappings = searchService.loadMappings(indexId)
  const reverseMappings = new Map(Array.from(mappings).map(([k, v]) => [v, k]))
  
  // Build search results
  const searchResults: IndexSearchResult[] = []
  
  if (results.keys && results.distances) {
    const keys = results.keys
    const distances = results.distances
    
    for (let i = 0; i < keys.length; i++) {
      const key = Number(keys[i])
      const distance = distances[i]
      
      const chunkKey = reverseMappings.get(key)
      if (!chunkKey) continue
      
      // Load indexed document metadata
      const indexedDoc = findIndexedDoc(indexId, chunkKey) as unknown as IndexedDocument
      
      if (indexedDoc) {
        searchResults.push({
          documentId: indexedDoc.documentId,
          score: distance,
          text: indexedDoc.text,
          metadata: indexedDoc.metadata,
          chunkInfo: indexedDoc.chunkInfo,
        })
      }
    }
  }
  
  // Sort by score (lowest distance first - better matches)
  searchResults.sort((a, b) => a.score - b.score)
  
  return searchResults
}

async function getDocumentsToIndex(
  folderId: EARS.EntityId | null,
  searchIndex: SearchIndex
): Promise<DocumentDTO[]> {
  let documents: DocumentDTO[] = []
  
  if (folderId === null) {
    // Root folder - get all documents not in any collection
    documents = libraryQueries.getDocuments()
    documents = documents.filter(doc => !doc.collectionId)
  } else {
    // Get documents in this folder
    documents = libraryQueries.getDocumentsInCollection(folderId)
    
    // If not excluding subfolders, also get documents from child collections
    if (!searchIndex.excludeAllSubfolders) {
      const childCollections = await getChildCollectionsRecursive(folderId)
      for (const childId of childCollections) {
        if (!searchIndex.excludedFolderIds.includes(childId)) {
          const childDocs = libraryQueries.getDocumentsInCollection(childId)
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
  
  // Clean up all old IndexedDoc entities before reindexing
  deleteIndexedDocsForIndex(indexId)
  
  // Clear existing index
  searchService.deleteIndexFiles(indexId)
  indexCache.delete(indexId)
  
  // Create new index
  const index = searchService.createIndex(searchIndex)
  
  // Save mappings
  searchService.saveMappings(indexId, new Map())
  
  // Update cache
  indexCache.set(indexId, index)
  
  // Re-index all documents using batch processing
  await indexDocumentsInFolder(indexId, searchIndex.folderId)
}

// Auto-index new documents in folders with indices
export async function autoIndexNewDocument(documentId: EARS.EntityId): Promise<void> {
  const document = libraryQueries.getDocument(documentId)
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

// Delete all search indices for a folder when the folder is deleted
export async function deleteSearchIndicesForFolder(folderId: EARS.EntityId): Promise<void> {
  const indices = await getSearchIndicesForFolder(folderId)
  
  for (const index of indices) {
    await deleteSearchIndex(index.id)
  }
}