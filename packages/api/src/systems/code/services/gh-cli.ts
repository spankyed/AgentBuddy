import { execFile } from 'child_process'
import { promisify } from 'util'
import https from 'https'
import { settingsQueries } from '@/systems/settings/repository'
import { resolveCliPath } from '@/core/helpers/resolve-cli'
import type { GhPullRequest, GhPRComment, GhReviewThread } from '../types'

const execFileAsync = promisify(execFile)

async function resolvePath(): Promise<string> {
  const settings = settingsQueries.getSettings()
  const storedPath = settings.general.secrets.cliPaths?.['gh']
  return resolveCliPath('gh', storedPath)
}

async function runGh(args: string[], cwd: string, timeout = 30_000): Promise<string> {
  const ghPath = await resolvePath()
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
      const msg = error.stderr.trim()
      if (msg.includes('Resource not accessible by personal access token')) {
        throw new Error('GitHub token missing required permissions. Run `gh auth refresh -s repo` or update your fine-grained token to include Pull Request access.')
      }
      throw new Error(msg)
    }
    throw error
  }
}

const PR_JSON_FIELDS = 'number,title,headRefName,baseRefName,state,body,url,isDraft,author,createdAt,updatedAt'
const PR_DETAIL_FIELDS = `${PR_JSON_FIELDS},commits`

export async function checkAuth(cwd: string): Promise<{ available: boolean; prAccess: boolean }> {
  try {
    await runGh(['auth', 'status'], cwd, 10_000)
  } catch {
    return { available: false, prAccess: false }
  }
  // Probe actual PR access with a lightweight GraphQL query
  try {
    const { owner, name } = await getRepoInfo(cwd)
    await runGh([
      'api', 'graphql',
      '-f', 'query=query($owner:String!,$name:String!){ repository(owner:$owner,name:$name){ pullRequests(first:0){ totalCount } } }',
      '-F', `owner=${owner}`,
      '-F', `name=${name}`,
    ], cwd, 10_000)
    return { available: true, prAccess: true }
  } catch {
    return { available: true, prAccess: false }
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
      '--state', 'all',
      '--limit', '3',
    ], cwd)
    if (!output) return null
    const prs = parseJson<GhPullRequest[]>(output, `PR for branch ${branch}`)
    if (prs.length === 0) return null
    // Prefer open PR if multiple exist
    return prs.find(pr => pr.state === 'OPEN') || prs[0]
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

export async function updatePR(
  cwd: string,
  number: number,
  opts: { title?: string; body?: string; base?: string }
): Promise<void> {
  const args = ['pr', 'edit', String(number)]
  if (opts.title) args.push('--title', opts.title)
  if (opts.body !== undefined) args.push('--body', opts.body)
  if (opts.base) args.push('--base', opts.base)
  await runGh(args, cwd)
}

// --- Issue comment operations ---

export async function createPRComment(cwd: string, number: number, body: string): Promise<void> {
  await runGh(['pr', 'comment', String(number), '--body', body], cwd)
}

export async function editPRComment(cwd: string, commentId: number, body: string): Promise<void> {
  const { owner, name } = await getRepoInfo(cwd)
  await runGh(['api', `repos/${owner}/${name}/issues/comments/${commentId}`, '-X', 'PATCH', '-f', `body=${body}`], cwd)
}

export async function deletePRComment(cwd: string, commentId: number): Promise<void> {
  const { owner, name } = await getRepoInfo(cwd)
  await runGh(['api', `repos/${owner}/${name}/issues/comments/${commentId}`, '-X', 'DELETE'], cwd)
}

// --- Review thread operations ---

export async function getReviewThreads(cwd: string, number: number): Promise<GhReviewThread[]> {
  const { owner, name } = await getRepoInfo(cwd)
  const query = `query($owner:String!,$name:String!,$number:Int!){
    repository(owner:$owner,name:$name){
      pullRequest(number:$number){
        reviewThreads(first:100){
          nodes{
            id isResolved isOutdated path line
            comments(first:50){
              nodes{ id databaseId body author{login} createdAt viewerDidAuthor }
            }
          }
        }
      }
    }
  }`
  const output = await runGh([
    'api', 'graphql',
    '-f', `query=${query}`,
    '-F', `owner=${owner}`,
    '-F', `name=${name}`,
    '-F', `number=${number}`,
  ], cwd)
  const data = parseJson<any>(output, 'review threads')
  const nodes = data?.data?.repository?.pullRequest?.reviewThreads?.nodes || []
  return nodes.map((t: any) => ({
    id: t.id,
    isResolved: t.isResolved,
    isOutdated: t.isOutdated,
    path: t.path,
    line: t.line,
    comments: (t.comments?.nodes || []).map((c: any) => ({
      id: c.id,
      databaseId: c.databaseId,
      body: c.body,
      author: c.author,
      createdAt: c.createdAt,
      viewerDidAuthor: c.viewerDidAuthor ?? false,
    })),
  }))
}

export async function replyToReviewThread(cwd: string, prNumber: number, commentDatabaseId: number, body: string): Promise<void> {
  const { owner, name } = await getRepoInfo(cwd)
  await runGh([
    'api', `repos/${owner}/${name}/pulls/${prNumber}/comments/${commentDatabaseId}/replies`,
    '-X', 'POST', '-f', `body=${body}`,
  ], cwd)
}

export async function editReviewComment(cwd: string, commentId: number, body: string): Promise<void> {
  const { owner, name } = await getRepoInfo(cwd)
  await runGh(['api', `repos/${owner}/${name}/pulls/comments/${commentId}`, '-X', 'PATCH', '-f', `body=${body}`], cwd)
}

export async function deleteReviewComment(cwd: string, commentId: number): Promise<void> {
  const { owner, name } = await getRepoInfo(cwd)
  await runGh(['api', `repos/${owner}/${name}/pulls/comments/${commentId}`, '-X', 'DELETE'], cwd)
}

export async function resolveReviewThread(cwd: string, threadId: string): Promise<void> {
  const mutation = `mutation($id:ID!){ resolveReviewThread(input:{threadId:$id}){ clientMutationId } }`
  await runGh(['api', 'graphql', '-f', `query=${mutation}`, '-F', `id=${threadId}`], cwd)
}

export async function unresolveReviewThread(cwd: string, threadId: string): Promise<void> {
  const mutation = `mutation($id:ID!){ unresolveReviewThread(input:{threadId:$id}){ clientMutationId } }`
  await runGh(['api', 'graphql', '-f', `query=${mutation}`, '-F', `id=${threadId}`], cwd)
}

// --- Helpers ---

async function getRepoInfo(cwd: string): Promise<{ owner: string; name: string }> {
  const output = await runGh(['repo', 'view', '--json', 'owner,name'], cwd, 5_000)
  const data = parseJson<{ owner: { login: string }; name: string }>(output, 'repo info')
  return { owner: data.owner.login, name: data.name }
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
