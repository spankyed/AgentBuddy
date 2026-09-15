import * as path from 'path'
import * as fs from 'fs'
import { resolveAppContext } from '../env/index.ts'

const DATA_DIRS = {
  lmdb:         'ears-db',
  volatileLmdb: 'ears-trace',
  legacySecretsLmdb: 'ears-secrets',
  secretsFile:  'secrets.json',
  media:        'media',
}

// === Public API ===

export const getUserDataPath = (): string => resolveAppContext().userDataDir
/** @internal Host-only: the app's database location. */
export const getLmdbPath = (): string => resolvePath('lmdb')
/** @internal Host-only: the app's database location. */
export const getVolatileLmdbPath = (): string => resolvePath('volatileLmdb')
/** @internal Host-only: where API keys were stored in plain text before the encrypted store (imported once, then deleted). */
export const getLegacySecretsLmdbPath = (): string => resolvePath('legacySecretsLmdb')
/** @internal Host-only: the file holding the user's API keys (values encrypted). */
export const getSecretsFilePath = (): string => resolvePath('secretsFile')
/** @internal Host-only: the app's media location. */
export const getMediaPath = (): string => resolvePath('media')

export const ensureDirectoryExists = (dirPath: string): void => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

export function resolvePath(key: keyof typeof DATA_DIRS): string {
  return getDataDirPath(DATA_DIRS[key])
}

/** A directory the app or a pack keeps data in, under the app's data directory (`name` is its folder) */
export function getDataDirPath(name: string): string {
  // Existing on-disk layout: packaged builds store data at the root of the data dir,
  // source runs (NODE_ENV=development) under .data/
  const userDataDir = getUserDataPath()
  return process.env.NODE_ENV === 'production' ? path.join(userDataDir, name) : path.join(userDataDir, '.data', name)
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
