import * as path from 'path'
import * as fs from 'fs'

let _userDataPath: string | undefined
let _isProd: boolean | undefined

function userDataPath() {
  if (_userDataPath === undefined) _userDataPath = process.env.USER_DATA_PATH || process.cwd()
  return _userDataPath
}
function isProd() {
  if (_isProd === undefined) _isProd = process.env.NODE_ENV === 'production' && !!process.env.USER_DATA_PATH
  return _isProd
}

const DATA_DIRS = {
  modelsCache:  'models-cache',
  searchIndices: 'search-indices',
  lmdb:         'ears-db',
  volatileLmdb: 'ears-trace',
  secretsLmdb:  'ears-secrets',
  media:        'media',
}

// === Public API ===

export const getUserDataPath = (): string => userDataPath()
export const getSearchIndicesPath = (): string => resolvePath('searchIndices')
export const getModelsCachePath = (): string => resolvePath('modelsCache')
export const getLmdbPath = (): string => resolvePath('lmdb')
export const getVolatileLmdbPath = (): string => resolvePath('volatileLmdb')
export const getSecretsLmdbPath = (): string => resolvePath('secretsLmdb')
export const getMediaPath = (): string => resolvePath('media')

export const ensureDirectoryExists = (dirPath: string): void => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

export const getIndexPath = (indexId: string): string =>
  path.join(getSearchIndicesPath(), indexId)

export const getIndexFilePath = (indexId: string): string =>
  path.join(getIndexPath(indexId), 'index.usearch')

export const getIndexMetadataPath = (indexId: string): string =>
  path.join(getIndexPath(indexId), 'metadata.json')

export const getIndexMappingsPath = (indexId: string): string =>
  path.join(getIndexPath(indexId), 'mappings.json')

export function resolvePath(key: keyof typeof DATA_DIRS): string {
  const name = DATA_DIRS[key]
  return isProd() ? path.join(userDataPath(), name) : path.join(userDataPath(), '.data', name)
}

export function createExportDir(parentDir: string, systemName: string): string {
  const now = new Date()
  const ts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '-',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('')
  const fullPath = path.join(parentDir, `${systemName}-${ts}`)
  ensureDirectoryExists(fullPath)
  return fullPath
}
