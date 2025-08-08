import { FlagEmbedding } from 'fastembed'
import { Index, MetricKind, ScalarKind } from 'usearch'
import * as fs from 'fs'
import * as path from 'path'
import type { SearchIndexConfig, EmbeddingResult, Occurrence, SegmentRule, SearchIndex, EmbeddingModel } from '../types/search-index'
import type { ContentSection } from '../types'
import type { EARS } from '@/core/types'
import { getModelConfig, getModelDimensions } from '../config/embedding-models'
import { getFastEmbedModel } from '../config/fastembed-mapping'

// Initialize embedding models (lazy loading)
let embeddingModels: Map<string, FlagEmbedding | null> = new Map()

export async function getEmbeddingModel(modelId: string): Promise<FlagEmbedding | null> {
  if (!embeddingModels.has(modelId)) {
    let model: FlagEmbedding | null = null
    const config = getModelConfig(modelId)
    
    if (config && config.provider === 'fastembed' && config.fastEmbedModel) {
      // Use fastembed for local model
      const fastEmbedModel = getFastEmbedModel(config.fastEmbedModel)
      if (fastEmbedModel) {
        model = await FlagEmbedding.init({
          model: fastEmbedModel,
          // cacheDir: './data/models',
          maxLength: config.maxTokens,
        })
      }
    } else {
      // For OpenAI models, we'll handle separately with OpenAI API
      // Store null and handle in embedText function
      model = null
    }
    
    embeddingModels.set(modelId, model)
  }
  
  return embeddingModels.get(modelId) || null
}

export async function embedText(text: string, modelId: string): Promise<EmbeddingResult> {
  const config = getModelConfig(modelId)
  
  if (!config) {
    throw new Error(`Unknown embedding model: ${modelId}`)
  }
  
  if (config.provider === 'fastembed') {
    const model = await getEmbeddingModel(modelId)
    if (!model) {
      throw new Error(`Failed to initialize embedding model: ${config.displayName}`)
    }
    // queryEmbed returns a Promise<number[]>, not Promise<number[][]>
    const embedding = await model.queryEmbed(text)
    
    if (!embedding || embedding.length === 0) {
      throw new Error('Failed to generate embedding')
    }
    
    // Convert number[] to Float32Array
    const embeddingArray = new Float32Array(embedding)
    
    return {
      text,
      embedding: embeddingArray,
      model: modelId as EmbeddingModel,
    }
  } else if (config.provider === 'openai') {
    // Handle OpenAI embeddings
    const openai = await import('openai')
    const client = new openai.OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
    
    const response = await client.embeddings.create({
      model: config.apiModelName!,
      input: text,
    })
    
    return {
      text,
      embedding: new Float32Array(response.data[0].embedding),
      model: modelId as EmbeddingModel,
    }
  } else {
    throw new Error(`Unsupported embedding provider: ${config.provider}`)
  }
}

// Convert a content section to text
function sectionToText(section: ContentSection, key?: string): string {
  if (section.type === 'text') {
    return section.text
  } else if (section.type === 'list') {
    return section.items.join(', ')
  } else if (section.type === 'field') {
    if (key) {
      const field = section.fields.find(f => f.key === key)
      return field ? field.value : ''
    }
    return section.fields.map(f => `${f.key}: ${f.value}`).join('; ')
  }
  return ''
}

// Parse occurrence string to typed Occurrence
export function parseOccurrence(value: string): Occurrence {
  const trimmed = value.trim().toLowerCase()
  
  if (trimmed === 'first' || trimmed === 'last' || trimmed === 'all') {
    return trimmed as 'first' | 'last' | 'all'
  }
  
  const singleNumber = /^(\d+)$/.exec(trimmed)
  if (singleNumber) {
    return { index: parseInt(singleNumber[1]) }
  }
  
  const range = /^(\d+)-(\d+)$/.exec(trimmed)
  if (range) {
    return { 
      from: parseInt(range[1]), 
      to: parseInt(range[2]) 
    }
  }
  
  // Default to 'all' if parsing fails
  return 'all'
}

// Extract sections from content based on type and occurrence
function extractSections(
  sections: ContentSection[], 
  type: 'text' | 'list' | 'field',
  occurrence: Occurrence,
  key?: string
): string[] {
  // Filter sections by type and key (for fields)
  let matchingSections = sections.filter(section => {
    if (section.type !== type) return false
    if (type === 'field' && key) {
      return section.type === 'field' && section.fields.some(field => field.key === key)
    }
    return true
  })
  
  // Apply occurrence logic
  let selectedSections: ContentSection[] = []
  
  if (occurrence === 'first') {
    selectedSections = matchingSections.slice(0, 1)
  } else if (occurrence === 'last') {
    selectedSections = matchingSections.slice(-1)
  } else if (occurrence === 'all') {
    selectedSections = matchingSections
  } else if ('index' in occurrence) {
    // 1-indexed
    const idx = occurrence.index - 1
    if (idx >= 0 && idx < matchingSections.length) {
      selectedSections = [matchingSections[idx]]
    }
  } else if ('from' in occurrence && 'to' in occurrence) {
    // 1-indexed, inclusive
    const from = occurrence.from - 1
    const to = occurrence.to
    selectedSections = matchingSections.slice(from, to)
  }
  
  // Convert selected sections to text using the reusable helper
  return selectedSections
    .map(section => sectionToText(section, key))
    .filter(text => text.length > 0)
}

// Process document content according to index configuration
export function processDocumentContent(
  content: ContentSection[],
  config: SearchIndexConfig
): string {
  // If no section indexing and no segment rules, use first content section as segment 1
  if (!config.enableSectionIndexing || config.segmentRules.length === 0) {
    // Get the first content section as text using the helper
    let firstSectionText = ''
    if (content.length > 0) {
      firstSectionText = sectionToText(content[0])
    }
    
    // Apply the template with segment 1
    let result = config.constructTemplate || '{{segment 1}}'
    result = result.replaceAll('{{segment 1}}', firstSectionText)
    
    // If there are other segment placeholders, replace them with empty strings
    result = result.replace(/\{\{segment \d+\}\}/g, '')
    
    return result.trim() || firstSectionText // Fallback to first section if template produces empty string
  }
  
  // Apply segment rules and template
  const segments: string[] = []
  
  for (const rule of config.segmentRules) {
    const occurrence = parseOccurrence(rule.occurrence)
    const extracted = extractSections(content, rule.type, occurrence, rule.key)
    segments.push(extracted.join(' '))
  }
  
  // Apply template
  let result = config.constructTemplate
  segments.forEach((segment, index) => {
    const placeholder = `{{segment ${index + 1}}}`
    result = result.replaceAll(placeholder, segment)
  })
  
  return result
}

/**
 * Process document content with multi-indexing support for separate list/field items.
 * When a segment rule has indexMode='separate', each list item or field value
 * becomes its own searchable chunk in the index.
 */
export function processDocumentContentMultiIndex(
  content: ContentSection[],
  config: SearchIndexConfig
): Array<{text: string, segmentIndex: number, itemIndex?: number}> {
  const results: Array<{text: string, segmentIndex: number, itemIndex?: number}> = []
  
  // If no section indexing, return single chunk
  if (!config.enableSectionIndexing || config.segmentRules.length === 0) {
    const text = processDocumentContent(content, config)
    return [{text, segmentIndex: 0}]
  }
  
  // Process each segment rule
  const segmentTexts: Array<{text: string | string[], isSeparate: boolean}> = []
  
  for (let i = 0; i < config.segmentRules.length; i++) {
    const rule = config.segmentRules[i]
    const occurrence = parseOccurrence(rule.occurrence)
    
    // Check if this is a list/field with separate indexing
    const shouldSeparate = (rule.type === 'list' || rule.type === 'field') && 
                          rule.indexMode === 'separate'
    
    if (shouldSeparate) {
      // Extract individual items for separate indexing
      const sections = extractSectionsRaw(content, rule.type, occurrence, rule.key)
      const items: string[] = []
      
      for (const section of sections) {
        if (rule.type === 'list' && section.type === 'list') {
          // Add each list item separately
          items.push(...section.items)
        } else if (rule.type === 'field' && section.type === 'field') {
          // Add each field value separately
          if (rule.key) {
            const field = section.fields.find(f => f.key === rule.key)
            if (field) items.push(field.value)
          } else {
            items.push(...section.fields.map(f => `${f.key}: ${f.value}`))
          }
        }
      }
      
      segmentTexts.push({text: items, isSeparate: true})
    } else {
      // Combined mode - join all extracted text
      const extracted = extractSections(content, rule.type, occurrence, rule.key)
      segmentTexts.push({text: extracted.join(' '), isSeparate: false})
    }
  }
  
  // Generate all combinations for separated segments
  const generateCombinations = (
    template: string,
    segmentTexts: Array<{text: string | string[], isSeparate: boolean}>,
    currentIndex: number = 0,
    currentValues: Record<number, {text: string, itemIndex?: number}> = {}
  ): void => {
    if (currentIndex >= segmentTexts.length) {
      // Apply template with current values
      let result = template
      const segmentInfo: Record<number, number | undefined> = {}
      
      for (const [segIdx, value] of Object.entries(currentValues)) {
        const placeholder = `{{segment ${parseInt(segIdx) + 1}}}`
        result = result.replaceAll(placeholder, value.text)
        if (value.itemIndex !== undefined) {
          segmentInfo[parseInt(segIdx)] = value.itemIndex
        }
      }
      
      // Find which segment has an item index (for separate indexing)
      let segmentIndex = 0
      let itemIndex: number | undefined
      
      for (const [idx, info] of Object.entries(segmentInfo)) {
        if (info !== undefined) {
          segmentIndex = parseInt(idx)
          itemIndex = info
          break
        }
      }
      
      results.push({text: result, segmentIndex, itemIndex})
      return
    }
    
    const segment = segmentTexts[currentIndex]
    
    if (segment.isSeparate && Array.isArray(segment.text)) {
      // For separated segments, iterate through each item
      segment.text.forEach((item, itemIdx) => {
        generateCombinations(
          template,
          segmentTexts,
          currentIndex + 1,
          {...currentValues, [currentIndex]: {text: item, itemIndex: itemIdx}}
        )
      })
    } else {
      // For combined segments, use the text as-is
      const text = Array.isArray(segment.text) ? segment.text.join(' ') : segment.text
      generateCombinations(
        template,
        segmentTexts,
        currentIndex + 1,
        {...currentValues, [currentIndex]: {text}}
      )
    }
  }
  
  generateCombinations(config.constructTemplate, segmentTexts)
  
  // If no results were generated, return default
  if (results.length === 0) {
    const text = processDocumentContent(content, config)
    return [{text, segmentIndex: 0}]
  }
  
  return results
}

// Helper to extract raw sections without converting to text
function extractSectionsRaw(
  sections: ContentSection[], 
  type: 'text' | 'list' | 'field',
  occurrence: Occurrence,
  key?: string
): ContentSection[] {
  // Filter sections by type and key (for fields)
  let matchingSections = sections.filter(section => {
    if (section.type !== type) return false
    if (type === 'field' && key) {
      return section.type === 'field' && section.fields.some(field => field.key === key)
    }
    return true
  })
  
  // Apply occurrence logic
  let selectedSections: ContentSection[] = []
  
  if (occurrence === 'first') {
    selectedSections = matchingSections.slice(0, 1)
  } else if (occurrence === 'last') {
    selectedSections = matchingSections.slice(-1)
  } else if (occurrence === 'all') {
    selectedSections = matchingSections
  } else if ('index' in occurrence) {
    // 1-indexed
    const idx = occurrence.index - 1
    if (idx >= 0 && idx < matchingSections.length) {
      selectedSections = [matchingSections[idx]]
    }
  } else if ('from' in occurrence && 'to' in occurrence) {
    // 1-indexed, inclusive
    const from = occurrence.from - 1
    const to = occurrence.to
    selectedSections = matchingSections.slice(from, to)
  }
  
  return selectedSections
}

// Get vector dimensions for embedding model
export function getVectorDimensions(modelId: string): number {
  return getModelDimensions(modelId)
}

// Create a new USearch index
export function createIndex(config: SearchIndexConfig): Index {
  const dimensions = getVectorDimensions(config.embeddingModel)
  const metric = config.indexMetric === 'cosine' ? MetricKind.Cos : MetricKind.IP
  
  // USearch Index constructor expects: new Index(options)
  // where options includes: dimensions, metric, connectivity, etc.

  // return new Index(dimensions, metric)
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

// Load index from disk
export async function loadIndex(indexPath: string, config: SearchIndexConfig): Promise<Index> {
  const index = createIndex(config)
  
  if (fs.existsSync(indexPath)) {
    await index.load(indexPath)
  }
  
  return index
}

// Save index to disk
export async function saveIndex(index: Index, indexPath: string): Promise<void> {
  const dir = path.dirname(indexPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  
  await index.save(indexPath)
}

// Get index file path
export function getIndexPath(indexId: EARS.EntityId): string {
  return path.join('./data/search-indices', indexId, 'index.usearch')
}

// Get metadata file path
export function getMetadataPath(indexId: EARS.EntityId): string {
  return path.join('./data/search-indices', indexId, 'metadata.json')
}

// Get mappings file path
export function getMappingsPath(indexId: EARS.EntityId): string {
  return path.join('./data/search-indices', indexId, 'mappings.json')
}

// Save index metadata
export function saveMetadata(indexId: EARS.EntityId, metadata: any): void {
  const metadataPath = getMetadataPath(indexId)
  const dir = path.dirname(metadataPath)
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2))
}

// Load index metadata
export function loadMetadata(indexId: EARS.EntityId): any | null {
  const metadataPath = getMetadataPath(indexId)
  
  if (!fs.existsSync(metadataPath)) {
    return null
  }
  
  return JSON.parse(fs.readFileSync(metadataPath, 'utf-8'))
}

// Save document-to-vector mappings
export function saveMappings(indexId: EARS.EntityId, mappings: Map<string, number>): void {
  const mappingsPath = getMappingsPath(indexId)
  const dir = path.dirname(mappingsPath)
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  
  const obj = Object.fromEntries(mappings)
  fs.writeFileSync(mappingsPath, JSON.stringify(obj, null, 2))
}

// Load document-to-vector mappings
export function loadMappings(indexId: EARS.EntityId): Map<string, number> {
  const mappingsPath = getMappingsPath(indexId)
  
  if (!fs.existsSync(mappingsPath)) {
    return new Map()
  }
  
  const obj = JSON.parse(fs.readFileSync(mappingsPath, 'utf-8'))
  return new Map(Object.entries(obj).map(([k, v]) => [k, v as number]))
}

// Delete index files
export function deleteIndexFiles(indexId: EARS.EntityId): void {
  const indexDir = path.join('./data/search-indices', indexId)
  
  if (fs.existsSync(indexDir)) {
    fs.rmSync(indexDir, { recursive: true })
  }
}