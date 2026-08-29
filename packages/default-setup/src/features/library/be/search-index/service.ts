import { FlagEmbedding } from 'fastembed'
import { Index, MetricKind, ScalarKind } from 'usearch'
import * as fs from 'fs'
import * as path from 'path'
import type { SearchIndexConfig, EmbeddingResult, Occurrence, SearchIndex, EmbeddingModel } from './types/search-index'
import type { ContentSection } from '@/systems/library/types'
import type { EARS } from '@/core/types'
import { getModelConfig, getModelDimensions } from './config/embedding-models'
import { getFastEmbedModel } from './config/fastembed-mapping'
import { 
  getModelsCachePath, 
  ensureDirectoryExists,
  getIndexFilePath,
  getIndexMetadataPath,
  getIndexMappingsPath,
  getSearchIndicesPath
} from '@/core/shared/paths'

// Lazy-loaded embedding models cache
const embeddingModels = new Map<string, FlagEmbedding | null>()

// OpenAI client singleton
let openaiClient: any = null

async function getOpenAIClient() {
  if (!openaiClient) {
    const openai = await import('openai')
    openaiClient = new openai.OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  }
  return openaiClient
}

async function getOrInitEmbeddingModel(modelId: string): Promise<FlagEmbedding | null> {
  if (embeddingModels.has(modelId)) {
    return embeddingModels.get(modelId) || null
  }

  const config = getModelConfig(modelId)
  if (!config) return null

  let model: FlagEmbedding | null = null
  
  if (config.provider === 'fastembed' && config.fastEmbedModel) {
    const fastEmbedModel = getFastEmbedModel(config.fastEmbedModel)
    if (fastEmbedModel) {
      const cacheDir = getModelsCachePath()
      ensureDirectoryExists(cacheDir)
      
      model = await FlagEmbedding.init({
        model: fastEmbedModel,
        cacheDir,
        maxLength: config.maxTokens,
      })
    }
  }
  
  embeddingModels.set(modelId, model)
  return model
}

/**
 * Generate embedding for a single text
 */
export async function embedText(text: string, modelId: string): Promise<EmbeddingResult> {
  const config = getModelConfig(modelId)
  if (!config) throw new Error(`Unknown embedding model: ${modelId}`)
  
  if (config.provider === 'fastembed') {
    const model = await getOrInitEmbeddingModel(modelId)
    if (!model) throw new Error(`Failed to initialize model: ${config.displayName}`)
    
    const embedding = await model.queryEmbed(text)
    if (!embedding?.length) throw new Error('Failed to generate embedding')
    
    return {
      text,
      embedding: new Float32Array(embedding),
      model: modelId as EmbeddingModel,
    }
  }
  
  // OpenAI
  const client = await getOpenAIClient()
  const response = await client.embeddings.create({
    model: config.apiModelName!,
    input: text,
  })
  
  return {
    text,
    embedding: new Float32Array(response.data[0].embedding),
    model: modelId as EmbeddingModel,
  }
}

/**
 * Generate embeddings for multiple texts in batch
 */
export async function embedTextsBatch(
  texts: string[], 
  modelId: string, 
  batchSize = 256
): Promise<EmbeddingResult[]> {
  const config = getModelConfig(modelId)
  if (!config) throw new Error(`Unknown embedding model: ${modelId}`)
  
  const results: EmbeddingResult[] = []
  
  if (config.provider === 'fastembed') {
    const model = await getOrInitEmbeddingModel(modelId)
    if (!model) throw new Error(`Failed to initialize model: ${config.displayName}`)
    
    const embeddings = model.embed(texts, batchSize)
    let textIndex = 0
    
    for await (const batch of embeddings) {
      for (const embedding of batch) {
        if (!embedding?.length) {
          throw new Error(`Failed to generate embedding at index ${textIndex}`)
        }
        results.push({
          text: texts[textIndex++],
          embedding: new Float32Array(embedding),
          model: modelId as EmbeddingModel,
        })
      }
    }
    
    return results
  }
  
  // OpenAI batch processing
  const client = await getOpenAIClient()
  const OPENAI_BATCH_SIZE = 100
  
  for (let i = 0; i < texts.length; i += OPENAI_BATCH_SIZE) {
    const batch = texts.slice(i, i + OPENAI_BATCH_SIZE)
    const response = await client.embeddings.create({
      model: config.apiModelName!,
      input: batch,
    })
    
    response.data.forEach((data: any, j: number) => {
      results.push({
        text: batch[j],
        embedding: new Float32Array(data.embedding),
        model: modelId as EmbeddingModel,
      })
    })
  }
  
  return results
}

/**
 * Parse occurrence string to typed Occurrence
 */
function parseOccurrence(value: string): Occurrence {
  const trimmed = value.trim().toLowerCase()
  
  if (trimmed === 'first' || trimmed === 'last' || trimmed === 'all') {
    return trimmed as 'first' | 'last' | 'all'
  }
  
  const single = /^(\d+)$/.exec(trimmed)
  if (single) return { index: parseInt(single[1]) }
  
  const range = /^(\d+)-(\d+)$/.exec(trimmed)
  if (range) return { from: parseInt(range[1]), to: parseInt(range[2]) }
  
  return 'all'
}

/**
 * Apply occurrence filter to sections
 */
function applyOccurrence<T>(items: T[], occurrence: Occurrence): T[] {
  if (occurrence === 'first') return items.slice(0, 1)
  if (occurrence === 'last') return items.slice(-1)
  if (occurrence === 'all') return items
  
  if ('index' in occurrence) {
    const idx = occurrence.index - 1 // Convert to 0-indexed
    return idx >= 0 && idx < items.length ? [items[idx]] : []
  }
  
  if ('from' in occurrence && 'to' in occurrence) {
    return items.slice(occurrence.from - 1, occurrence.to)
  }
  
  return items
}

/**
 * Convert content section to text
 */
function sectionToText(section: ContentSection, key?: string): string {
  switch (section.type) {
    case 'markdown':
    case 'text':
      return section.text
    case 'list':
      return section.items.join(', ')
    case 'field':
      if (key) {
        const field = section.fields.find(f => f.key === key)
        return field?.value || ''
      }
      return section.fields.map(f => `${f.key}: ${f.value}`).join('; ')
    default:
      return ''
  }
}

/**
 * Extract matching sections based on criteria
 */
function extractMatchingSections(
  sections: ContentSection[],
  type: 'markdown' | 'text' | 'list' | 'field',
  occurrence: Occurrence,
  key?: string
): ContentSection[] {
  const matching = sections.filter(section => {
    if (section.type !== type) return false
    if (type === 'field' && key && section.type === 'field') {
      return section.fields.some(f => f.key === key)
    }
    return true
  })
  
  return applyOccurrence(matching, occurrence)
}

/**
 * Process document content for single indexing
 */
export function processDocumentContent(
  content: ContentSection[],
  config: SearchIndexConfig
): string {
  if (!config.enableSectionIndexing || !config.segmentRules.length) {
    const firstText = content.length > 0 ? sectionToText(content[0]) : ''
    const result = (config.constructTemplate || '{{segment 1}}')
      .replace('{{segment 1}}', firstText)
      .replace(/\{\{segment \d+\}\}/g, '')
    return result.trim() || firstText
  }
  
  const segments = config.segmentRules.map(rule => {
    const occurrence = parseOccurrence(rule.occurrence)
    const sections = extractMatchingSections(content, rule.type, occurrence, rule.key)
    return sections.map(s => sectionToText(s, rule.key)).join(' ')
  })
  
  let result = config.constructTemplate
  segments.forEach((segment, i) => {
    result = result.replace(`{{segment ${i + 1}}}`, segment)
  })
  
  return result
}

/**
 * Process document content for multi-indexing (separate chunks)
 */
export function processDocumentContentMultiIndex(
  content: ContentSection[],
  config: SearchIndexConfig
): Array<{text: string, segmentIndex: number, itemIndex?: number}> {
  if (!config.enableSectionIndexing || !config.segmentRules.length) {
    return [{text: processDocumentContent(content, config), segmentIndex: 0}]
  }
  
  const results: Array<{text: string, segmentIndex: number, itemIndex?: number}> = []
  const template = config.constructTemplate
  
  // Process rules and collect segment data
  const segmentData = config.segmentRules.map((rule, index) => {
    const occurrence = parseOccurrence(rule.occurrence)
    const sections = extractMatchingSections(content, rule.type, occurrence, rule.key)
    const shouldSeparate = (rule.type === 'list' || rule.type === 'field') && 
                          rule.indexMode === 'separate'
    
    if (!shouldSeparate) {
      return {
        index,
        items: [sections.map(s => sectionToText(s, rule.key)).join(' ')],
        separate: false
      }
    }
    
    // Extract individual items for separate indexing
    const items: string[] = []
    sections.forEach(section => {
      if (rule.type === 'list' && section.type === 'list') {
        items.push(...section.items)
      } else if (rule.type === 'field' && section.type === 'field') {
        if (rule.key) {
          const field = section.fields.find(f => f.key === rule.key)
          if (field) items.push(field.value)
        } else {
          items.push(...section.fields.map(f => `${f.key}: ${f.value}`))
        }
      }
    })
    
    return { index, items, separate: true }
  })
  
  // Find which segment should be separated
  const separateSegment = segmentData.find(s => s.separate && s.items.length > 0)
  
  if (!separateSegment) {
    // No separation needed, return single result
    let text = template
    segmentData.forEach(segment => {
      const placeholder = `{{segment ${segment.index + 1}}}`
      text = text.replace(placeholder, segment.items[0] || '')
    })
    return [{text, segmentIndex: 0}]
  }
  
  // Generate combinations for separated items
  separateSegment.items.forEach((item, itemIndex) => {
    let text = template
    segmentData.forEach(segment => {
      const placeholder = `{{segment ${segment.index + 1}}}`
      if (segment === separateSegment) {
        text = text.replace(placeholder, item)
      } else {
        text = text.replace(placeholder, segment.items[0] || '')
      }
    })
    results.push({
      text,
      segmentIndex: separateSegment.index,
      itemIndex
    })
  })
  
  return results.length ? results : [{text: processDocumentContent(content, config), segmentIndex: 0}]
}

/**
 * USearch index operations
 */
export function createIndex(config: SearchIndexConfig): Index {
  const dimensions = getModelDimensions(config.embeddingModel)
  const metric = config.indexMetric === 'cosine' ? MetricKind.Cos : MetricKind.IP
  
  return new Index({
    dimensions,
    metric,
    quantization: ScalarKind.F32,
    connectivity: config.connectors || 16,
    expansion_add: 0,
    expansion_search: 0,
    multi: false,
  })
}

export async function loadIndex(indexPath: string, config: SearchIndexConfig): Promise<Index> {
  const index = createIndex(config)
  if (fs.existsSync(indexPath)) {
    await index.load(indexPath)
  }
  return index
}

export async function saveIndex(index: Index, indexPath: string): Promise<void> {
  ensureDirectoryExists(path.dirname(indexPath))
  await index.save(indexPath)
}

/**
 * File system operations for index metadata and mappings
 */
export function saveMetadata(indexId: EARS.EntityId, metadata: any): void {
  const metadataPath = getIndexMetadataPath(indexId)
  ensureDirectoryExists(path.dirname(metadataPath))
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2))
}

export function loadMetadata(indexId: EARS.EntityId): any | null {
  const metadataPath = getIndexMetadataPath(indexId)
  if (!fs.existsSync(metadataPath)) return null
  return JSON.parse(fs.readFileSync(metadataPath, 'utf-8'))
}

export function saveMappings(indexId: EARS.EntityId, mappings: Map<string, number>): void {
  const mappingsPath = getIndexMappingsPath(indexId)
  ensureDirectoryExists(path.dirname(mappingsPath))
  fs.writeFileSync(mappingsPath, JSON.stringify(Object.fromEntries(mappings), null, 2))
}

export function loadMappings(indexId: EARS.EntityId): Map<string, number> {
  const mappingsPath = getIndexMappingsPath(indexId)
  if (!fs.existsSync(mappingsPath)) return new Map()
  const obj = JSON.parse(fs.readFileSync(mappingsPath, 'utf-8'))
  return new Map(Object.entries(obj).map(([k, v]) => [k, v as number]))
}

export function deleteIndexFiles(indexId: EARS.EntityId): void {
  const indexDir = path.join(getSearchIndicesPath(), indexId)
  if (fs.existsSync(indexDir)) {
    fs.rmSync(indexDir, { recursive: true })
  }
}

// Export commonly used functions
export { getModelDimensions as getVectorDimensions } from './config/embedding-models'
export { getIndexFilePath as getIndexPath } from '@/core/shared/paths'