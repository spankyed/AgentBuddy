import { execFile } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'

const execFileAsync = promisify(execFile)

type CliName = 'copilot' | 'claude-code' | 'codex' | 'gh'

const HOME = process.env.HOME || ''

const FALLBACK_PATHS: Record<CliName, string[]> = {
  copilot: [
    '/usr/local/bin/copilot',
    `${HOME}/.nvm/versions/node/*/bin/copilot`,
  ],
  'claude-code': [
    `${HOME}/.claude/local/claude`,
    '/usr/local/bin/claude',
    `${HOME}/.nvm/versions/node/*/bin/claude`,
  ],
  codex: [
    '/usr/local/bin/codex',
    `${HOME}/.nvm/versions/node/*/bin/codex`,
  ],
  gh: [
    '/opt/homebrew/bin/gh',
    '/usr/local/bin/gh',
  ],
}

const resolvedCache = new Map<string, string>()

/**
 * Expand nvm glob patterns (e.g. ~/.nvm/versions/node/* /bin/copilot)
 * into actual paths sorted by version descending (newest first).
 */
function expandGlobPaths(pattern: string): string[] {
  if (!pattern.includes('*')) return [pattern]

  const dir = path.dirname(path.dirname(pattern)) // e.g. ~/.nvm/versions/node
  const binary = path.basename(pattern)

  try {
    const entries = fs.readdirSync(dir)
    return entries
      .filter(e => e.startsWith('v'))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
      .map(version => path.join(dir, version, 'bin', binary))
  } catch {
    return []
  }
}

/**
 * Check if a command is executable.
 * Absolute paths: fs.accessSync with X_OK.
 * Bare commands: try running with --version.
 */
async function isExecutable(cmd: string): Promise<boolean> {
  if (path.isAbsolute(cmd)) {
    try {
      fs.accessSync(cmd, fs.constants.X_OK)
      return true
    } catch {
      return false
    }
  }

  try {
    await execFileAsync(cmd, ['--version'], { timeout: 5000 })
    return true
  } catch {
    return false
  }
}

/**
 * Resolve a CLI binary path with fallbacks.
 *
 * 1. Try the preferred path (from settings or bare command name)
 * 2. Try known fallback locations for the tool
 * 3. Return original command name if nothing found (caller gets standard ENOENT)
 */
export async function resolveCliPath(
  cli: CliName,
  preferredPath?: string,
): Promise<string> {
  const cacheKey = `${cli}:${preferredPath ?? ''}`
  const cached = resolvedCache.get(cacheKey)
  if (cached) return cached

  if (preferredPath) {
    if (await isExecutable(preferredPath)) {
      resolvedCache.set(cacheKey, preferredPath)
      return preferredPath
    }
  }

  const fallbacks = FALLBACK_PATHS[cli] ?? []
  for (const pattern of fallbacks) {
    for (const candidate of expandGlobPaths(pattern)) {
      if (fs.existsSync(candidate)) {
        resolvedCache.set(cacheKey, candidate)
        return candidate
      }
    }
  }

  const fallbackReturn = preferredPath || cli
  resolvedCache.set(cacheKey, fallbackReturn)
  return fallbackReturn
}

/** Clear the resolution cache (e.g. when CLI paths are updated in settings). */
export function clearCliPathCache(): void {
  resolvedCache.clear()
}
