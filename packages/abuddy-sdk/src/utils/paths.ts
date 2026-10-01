import * as path from 'path'
import * as fs from 'fs'
import { _appDirOf, resolveAppContext } from '../env/index.ts'
import { _pathSegmentProblem } from './path-segment.ts'

/** @internal Host-only: the app's stores in a data dir */
export interface _AppDataPaths {
  /** The database's primary partition */
  lmdb: string
  /** The database's volatile partition (run history) */
  volatileLmdb: string
  /** The user's secrets (values encrypted; the data key sits beside it) */
  secretsFile: string
  media: string
}

const DATA_DIRS: _AppDataPaths = {
  lmdb:         'ears-db',
  volatileLmdb: 'ears-trace',
  secretsFile:  'secrets.json',
  media:        'media',
}

/**
 * @internal Host-only: where `userDataDir` keeps the app's stores — inside `appDir`, the one directory the
 * app owns, whoever is running and however it was built.
 *
 * It used to fork on whether NODE_ENV named a production build: a packaged app at the data dir's root, a
 * source run under `.data/`. That put the choice in a variable the ecosystem uses to mean "optimize this
 * build", wrote the same rule down in six places, and let one directory end up holding two databases that
 * no tool could then open. Nothing decides a layout now, so there is nothing to disagree about.
 */
export function _appDataPaths(userDataDir: string): _AppDataPaths {
  const base = _appDirOf(userDataDir)
  const entries = Object.entries(DATA_DIRS).map(([key, name]) => [key, path.join(base, name)])
  return Object.fromEntries(entries) as _AppDataPaths
}

// === Public API ===

export const getUserDataPath = (): string => resolveAppContext().userDataDir
/** @internal Host-only: the app's database location. */
export const _getLmdbPath = (): string => _resolvePath('lmdb')
/** @internal Host-only: the app's database location. */
export const _getVolatileLmdbPath = (): string => _resolvePath('volatileLmdb')
/** @internal Host-only: the file holding the user's secrets (values encrypted). */
export const _getSecretsFilePath = (): string => _resolvePath('secretsFile')
/** @internal Host-only: the app's media location. */
export const _getMediaPath = (): string => _resolvePath('media')

export const ensureDirectoryExists = (dirPath: string): void => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

/**
 * @internal Host-only: one of the app's own stores. Every key is the app's — the database, the run
 * history, the user's secrets, the media store — so a pack keeps its data under `getDataDirPath`
 * (`#generated/paths`), which lands under `pack-data/<packId>/`.
 */
export function _resolvePath(key: keyof typeof DATA_DIRS): string {
  return _appDataPaths(getUserDataPath())[key]
}

/**
 * @internal Host-only: a directory a pack keeps data in, namespaced by the pack that asked
 * (`<appDir>/pack-data/<packId>/<name>`). Packs reach it through `getDataDirPath(name)` from
 * `#generated/paths`, which binds their own id the way `#generated/events` binds it for sends.
 *
 * The namespace is what makes the name safe to take from a pack: before it, `getDataDirPath` joined the
 * name straight onto a directory shared with Chromium, so `'Cache'`, `'packs'` or `'../..'` all resolved
 * to something that was not the pack's.
 */
export function _packDataDir(packId: string, name: string): string {
  const problem = _pathSegmentProblem(name, 'data directory name')
  if (problem) throw new Error(`${problem} It names one directory inside the pack's own.`)
  return path.join(_appDirOf(getUserDataPath()), 'pack-data', packId, name)
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
