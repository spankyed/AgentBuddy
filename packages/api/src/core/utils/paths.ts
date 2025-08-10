import * as path from 'path'
import * as fs from 'fs'

/**
 * Get the user data directory path
 * In production: Uses Electron's userData path (e.g., ~/Library/Application Support/AgentBuddy)
 * In development: Uses current working directory
 */
export function getUserDataPath(): string {
  return process.env.USER_DATA_PATH || process.cwd()
}

/**
 * Get the search indices directory path
 */
export function getSearchIndicesPath(): string {
  const userDataPath = getUserDataPath()
  
  // In development, use the src/core/data structure
  // In production, use the user data directory
  if (process.env.USER_DATA_PATH) {
    return path.join(userDataPath, 'search-indices')
  } else {
    // Development path - maintain compatibility with existing structure
    return path.join(userDataPath, 'src', 'core', 'data', 'search-indices')
  }
}

/**
 * Get the models cache directory path for embedding models
 */
export function getModelsCachePath(): string {
  const userDataPath = getUserDataPath()
  
  // In production, store models in user data directory
  // In development, store in project directory
  if (process.env.USER_DATA_PATH) {
    return path.join(userDataPath, 'models-cache')
  } else {
    // Development path
    return path.join(userDataPath, 'data', 'models')
  }
}

/**
 * Ensure a directory exists, creating it if necessary
 */
export function ensureDirectoryExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

/**
 * Get a specific index directory path
 */
export function getIndexPath(indexId: string): string {
  return path.join(getSearchIndicesPath(), indexId)
}

/**
 * Get the path for an index file
 */
export function getIndexFilePath(indexId: string): string {
  return path.join(getIndexPath(indexId), 'index.usearch')
}

/**
 * Get the path for index metadata
 */
export function getIndexMetadataPath(indexId: string): string {
  return path.join(getIndexPath(indexId), 'metadata.json')
}

/**
 * Get the path for index mappings
 */
export function getIndexMappingsPath(indexId: string): string {
  return path.join(getIndexPath(indexId), 'mappings.json')
}

/**
 * Get the snapshots directory path
 */
export function getSnapshotsPath(): string {
  const userDataPath = getUserDataPath()
  
  // In development, use the src/core/data structure
  // In production, use the user data directory
  if (process.env.USER_DATA_PATH) {
    return path.join(userDataPath, 'snapshots')
  } else {
    // Development path - maintain compatibility with existing structure
    return path.join(userDataPath, 'src', 'core', 'data', 'snapshots')
  }
}