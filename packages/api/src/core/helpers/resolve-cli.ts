import { execFile } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'

const execFileAsync = promisify(execFile)

export type CliName = 'copilot' | 'claude-code' | 'codex' | 'gh'

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
    await execFileAsync(cmd, ['--version'], { timeout: 2000 })
    return true
  } catch {
    return false
  }
}

/**
 * Resolve a CLI binary path with fallbacks.
 *
 * 1. If preferred path is absolute, check it exists (fast fs check)
 * 2. Try known fallback locations on disk (fast fs checks)
 * 3. If preferred path is a bare command, try executing it (slow, last resort)
 * 4. Return CLI name if nothing found (caller gets standard ENOENT)
 */
export async function resolveCliPath(
  cli: CliName,
  preferredPath?: string,
): Promise<string> {
  const effective = preferredPath?.trim() || undefined
  const cacheKey = `${cli}:${effective ?? ''}`
  const cached = resolvedCache.get(cacheKey)
  if (cached) return cached

  // 1. Fast check: absolute preferred path
  if (effective && path.isAbsolute(effective)) {
    if (await isExecutable(effective)) {
      resolvedCache.set(cacheKey, effective)
      return effective
    }
  }

  // 2. Fast check: known fallback locations (filesystem only)
  const fallbacks = FALLBACK_PATHS[cli] ?? []
  for (const pattern of fallbacks) {
    for (const candidate of expandGlobPaths(pattern)) {
      if (fs.existsSync(candidate)) {
        resolvedCache.set(cacheKey, candidate)
        return candidate
      }
    }
  }

  // 3. Slow check: bare command via PATH (execFile with 2s timeout)
  if (effective && !path.isAbsolute(effective)) {
    if (await isExecutable(effective)) {
      resolvedCache.set(cacheKey, effective)
      return effective
    }
  }

  // 4. Nothing found — return CLI name so caller gets a recognizable ENOENT
  resolvedCache.set(cacheKey, cli)
  return cli
}

/** Clear the resolution cache (e.g. when CLI paths are updated in settings). */
export function clearCliPathCache(): void {
  resolvedCache.clear()
}
