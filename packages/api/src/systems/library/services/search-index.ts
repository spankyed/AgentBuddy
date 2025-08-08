import { EmbeddingModel, FlagEmbedding } from 'fastembed'
import { Index } from 'usearch'
import * as fs from 'fs'
import * as path from 'path'
import type { SearchIndexConfig, EmbeddingResult, Occurrence, SegmentRule, SearchIndex } from '../types/search-index'
import type { ContentSection } from '../types'
import type { EARS } from '@/core/types'

// Initialize embedding models (lazy loading)
let embeddingModels: Map<string, FlagEmbedding | null> = new Map()

export async function getEmbeddingModel(modelName: string): Promise<FlagEmbedding | null> {
  if (!embeddingModels.has(modelName)) {
    let model: FlagEmbedding | null = null
    
    if (modelName === 'all-MiniLM-L6-v2') {
      // Use fastembed for local model
      model = await FlagEmbedding.init({
        model: EmbeddingModel.BGEBaseEN,
        // cacheDir: './data/models',
        // maxLength: 512,
      })
    } else {
      // For OpenAI models, we'll handle separately with OpenAI API
      // Store null and handle in embedText function
      model = null
    }
    
    embeddingModels.set(modelName, model)
  }
  
  return embeddingModels.get(modelName) || null
}

export async function embedText(text: string, modelName: string): Promise<EmbeddingResult> {
  if (modelName === 'all-MiniLM-L6-v2') {
    const model = await getEmbeddingModel(modelName)
    if (!model) {
      throw new Error(`Failed to initialize embedding model: ${modelName}`)
    }
    const embeddings = await model.queryEmbed(text)
    const embedding = embeddings[0]
    
    if (!embedding) {
      throw new Error('Failed to generate embedding')
    }
    
    return {
      text,
      embedding: new Float32Array(embedding),
      model: modelName as any,
    }
  } else {
    // Handle OpenAI embeddings
    const openai = await import('openai')
    const client = new openai.OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
    
    const response = await client.embeddings.create({
      model: modelName,
      input: text,
    })
    
    return {
      text,
      embedding: new Float32Array(response.data[0].embedding),
      model: modelName as any,
    }
  }
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
  
  // Convert selected sections to text
  return selectedSections.map(section => {
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
  }).filter(text => text.length > 0)
}

// Process document content according to index configuration
export function processDocumentContent(
  content: ContentSection[],
  config: SearchIndexConfig
): string {
  if (!config.enableSectionIndexing) {
    // Simple concatenation of all content
    return content.map(section => {
      if (section.type === 'text') {
        return section.text
      } else if (section.type === 'list') {
        return section.items.join(' ')
      } else if (section.type === 'field') {
        return section.fields.map(f => `${f.key}: ${f.value}`).join(' ')
      }
      return ''
    }).join(' ')
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

// Get vector dimensions for embedding model
export function getVectorDimensions(modelName: string): number {
  switch (modelName) {
    case 'all-MiniLM-L6-v2':
      return 384
    case 'text-embedding-3-small':
      return 1536
    case 'text-embedding-3-large':
      return 3072
    default:
      return 384
  }
}

// Create a new USearch index
export function createIndex(config: SearchIndexConfig): Index {
  const dimensions = getVectorDimensions(config.embeddingModel)
  const metric = config.indexMetric === 'cosine' ? 'cos' as any : 'ip' as any // cos = cosine, ip = inner product (dot)
  
  return new Index(dimensions, metric)
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