import { execFile } from 'child_process'
import { promisify } from 'util'
import https from 'https'
import { settingsQueries } from '@/systems/settings/repository'
import type { GhPullRequest, GhPRComment } from '../types'

const execFileAsync = promisify(execFile)

function resolvePath(): string {
  const settings = settingsQueries.getSettings()
  return settings.general.secrets.cliPaths?.['gh'] || 'gh'
}

async function runGh(args: string[], cwd: string, timeout = 30_000): Promise<string> {
  const ghPath = resolvePath()
  try {
    const { stdout } = await execFileAsync(ghPath, args, {
      cwd,
      timeout,
      env: { ...process.env },
    })
    return stdout.trim()
  } catch (error: any) {
    if (error.message?.includes('ENOENT')) {
      throw new Error('GitHub CLI (gh) not found. Install it from https://cli.github.com/ or configure the path in Settings > Providers.')
    }
    if (error.killed || error.message?.includes('TIMEOUT') || error.message?.includes('timed out')) {
      throw new Error(`GitHub CLI request timed out after ${timeout / 1000} seconds.`)
    }
    // gh outputs errors to stderr
    if (error.stderr) {
      throw new Error(error.stderr.trim())
    }
    throw error
  }
}

const PR_JSON_FIELDS = 'number,title,headRefName,baseRefName,state,body,url,isDraft,author,createdAt,updatedAt'
const PR_DETAIL_FIELDS = `${PR_JSON_FIELDS},commits`

export async function checkAuth(cwd: string): Promise<boolean> {
  try {
    await runGh(['auth', 'status'], cwd, 10_000)
    return true
  } catch {
    return false
  }
}

function parseJson<T>(output: string, context: string): T {
  try {
    return JSON.parse(output)
  } catch {
    throw new Error(`Failed to parse GitHub CLI response for ${context}. Output: ${output.slice(0, 200)}`)
  }
}

export async function listOpenPRs(cwd: string): Promise<GhPullRequest[]> {
  const output = await runGh([
    'pr', 'list',
    '--json', PR_JSON_FIELDS,
    '--state', 'open',
    '--limit', '50',
  ], cwd)
  if (!output) return []
  return parseJson<GhPullRequest[]>(output, 'listing PRs')
}

export async function getPRDetails(cwd: string, number: number): Promise<GhPullRequest & { comments: GhPRComment[] }> {
  const output = await runGh([
    'pr', 'view', String(number),
    '--json', `${PR_DETAIL_FIELDS},comments`,
  ], cwd)
  return parseJson<GhPullRequest & { comments: GhPRComment[] }>(output, `PR #${number}`)
}

export async function getPRForBranch(cwd: string, branch: string): Promise<GhPullRequest | null> {
  try {
    const output = await runGh([
      'pr', 'list',
      '--head', branch,
      '--json', PR_JSON_FIELDS,
      '--state', 'open',
      '--limit', '1',
    ], cwd)
    if (!output) return null
    const prs = parseJson<GhPullRequest[]>(output, `PR for branch ${branch}`)
    return prs.length > 0 ? prs[0] : null
  } catch {
    return null
  }
}

export async function createPR(
  cwd: string,
  opts: { title: string; body: string; base?: string; head?: string; draft?: boolean }
): Promise<GhPullRequest> {
  const args = ['pr', 'create', '--title', opts.title, '--body', opts.body]
  if (opts.base) args.push('--base', opts.base)
  if (opts.head) args.push('--head', opts.head)
  if (opts.draft) args.push('--draft')
  // gh pr create outputs the URL, not JSON. We create then fetch details.
  const url = await runGh(args, cwd)
  // Extract PR number from URL (e.g., https://github.com/owner/repo/pull/123)
  const match = url.match(/\/pull\/(\d+)/)
  if (!match) throw new Error('Failed to parse PR number from gh output')
  const prNumber = parseInt(match[1], 10)
  const details = await getPRDetails(cwd, prNumber)
  return details
}

export async function mergePR(
  cwd: string,
  number: number,
  method: 'merge' | 'squash' | 'rebase' = 'merge'
): Promise<void> {
  await runGh(['pr', 'merge', String(number), `--${method}`], cwd)
}

export async function closePR(cwd: string, number: number): Promise<void> {
  await runGh(['pr', 'close', String(number)], cwd)
}

export async function markDraft(cwd: string, number: number): Promise<void> {
  await runGh(['pr', 'ready', String(number), '--undo'], cwd)
}

export async function markReady(cwd: string, number: number): Promise<void> {
  await runGh(['pr', 'ready', String(number)], cwd)
}

// --- GitHub asset URL resolution ---

async function getAuthToken(cwd: string): Promise<string> {
  return runGh(['auth', 'token'], cwd, 5_000)
}

function resolveRedirect(url: string, token: string): Promise<string | null> {
  return new Promise((resolve) => {
    const req = https.request(url, {
      method: 'HEAD',
      headers: { Authorization: `token ${token}` },
    }, (res) => {
      if (res.statusCode === 302 && res.headers.location) {
        resolve(res.headers.location)
      } else {
        resolve(null)
      }
    })
    req.on('error', () => resolve(null))
    req.setTimeout(5_000, () => { req.destroy(); resolve(null) })
    req.end()
  })
}

const ASSET_URL_PATTERN = /https:\/\/github\.com\/user-attachments\/assets\/[a-f0-9-]+/g

export async function resolveGitHubAssetUrls(text: string, cwd: string): Promise<string> {
  if (!text) return text
  const matches = text.match(ASSET_URL_PATTERN)
  if (!matches) return text

  let token: string
  try {
    token = await getAuthToken(cwd)
  } catch {
    return text
  }

  let resolved = text
  const unique = [...new Set(matches)]
  const results = await Promise.all(
    unique.map(url => resolveRedirect(url, token))
  )
  for (let i = 0; i < unique.length; i++) {
    if (results[i]) {
      resolved = resolved.replaceAll(unique[i], results[i]!)
    }
  }
  return resolved
}
