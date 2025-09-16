import * as path from 'path'
import * as fs from 'fs'

const userDataPath = process.env.USER_DATA_PATH || process.cwd()
const cwd = process.cwd()
const isProd = process.env.NODE_ENV === 'production' && !!process.env.USER_DATA_PATH

/**
 * Map of subdirectory names (prod vs dev).
 * Only declare the differing parts here.
 */
const SUBDIRS = {
  modelsCache: { prod: 'models-cache', dev: 'src/persistence/data/untracked/models' },
  snapshots: { prod: 'snapshots', dev: 'src/persistence/data/untracked/snapshots' },
  searchIndices: { prod: 'search-indices', dev: 'src/persistence/data/untracked/search-indices' },
  lmdb: { prod: 'ears-db', dev: 'src/persistence/data/untracked/ears-db' },
  volatileLmdb: { prod: 'ears-trace', dev: 'src/persistence/data/untracked/ears-trace' },
  secretsLmdb: { prod: 'ears-secrets', dev: 'src/persistence/data/untracked/ears-secrets' },
}

// === Public API ===

export const getUserDataPath = (): string => userDataPath
export const getSearchIndicesPath = (): string => resolvePath('searchIndices')
export const getModelsCachePath = (): string => resolvePath('modelsCache')
export const getSnapshotsPath = (): string => resolvePath('snapshots')
export const getLmdbPath = (): string => resolvePath('lmdb')
export const getVolatileLmdbPath = (): string => resolvePath('volatileLmdb')
export const getSecretsLmdbPath = (): string => resolvePath('secretsLmdb')

/**
 * Ensure a directory exists, creating it if necessary
 */
export const ensureDirectoryExists = (dirPath: string): void => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

/**
 * Index-specific helpers
 */
export const getIndexPath = (indexId: string): string =>
  path.join(getSearchIndicesPath(), indexId)

export const getIndexFilePath = (indexId: string): string =>
  path.join(getIndexPath(indexId), 'index.usearch')

export const getIndexMetadataPath = (indexId: string): string =>
  path.join(getIndexPath(indexId), 'metadata.json')

export const getIndexMappingsPath = (indexId: string): string =>
  path.join(getIndexPath(indexId), 'mappings.json')

/**
 * Resolve a directory path based on environment (prod vs dev).
 * Hoisted to the bottom so it's always defined when used above.
 */
export function resolvePath(key: keyof typeof SUBDIRS): string {
  const { prod, dev } = SUBDIRS[key]
  return isProd ? path.join(userDataPath, prod) : path.join(cwd, dev)
}