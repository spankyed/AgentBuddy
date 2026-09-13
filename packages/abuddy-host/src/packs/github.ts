/**
 * GitHub requests for pack installs and update checks. A GITHUB_TOKEN (or GH_TOKEN) in the
 * environment authenticates them, which reaches private repositories and raises the API rate
 * limit; failures name the cause instead of looking like "no release".
 */

const TIMEOUT_MS = 10_000;

export function githubToken(): string | undefined {
  return process.env.GITHUB_TOKEN || process.env.GH_TOKEN || undefined;
}

export type GitHubFailure = 'rate-limited' | 'not-found' | 'unauthorized' | 'failed';

export class GitHubRequestError extends Error {
  constructor(message: string, readonly reason: GitHubFailure, readonly status?: number) {
    super(message);
    this.name = 'GitHubRequestError';
  }
}

function headers(accept: string): Record<string, string> {
  const token = githubToken();
  return {
    Accept: accept,
    'User-Agent': 'AgentBuddy',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/** Fetches a GitHub URL, throwing GitHubRequestError with the cause when it doesn't succeed. */
export async function githubFetch(url: string, accept = 'application/vnd.github+json'): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, { headers: headers(accept), signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    throw new GitHubRequestError(`GitHub request to ${url} failed: ${err instanceof Error ? err.message : err}`, 'failed');
  }
  if (response.ok) return response;

  const tokenHint = githubToken() ? '' : '; set GITHUB_TOKEN';
  if ((response.status === 403 || response.status === 429) && response.headers.get('x-ratelimit-remaining') === '0') {
    const reset = Number(response.headers.get('x-ratelimit-reset'));
    const when = Number.isFinite(reset) && reset > 0 ? ` until ${new Date(reset * 1000).toISOString()}` : '';
    throw new GitHubRequestError(`GitHub's API rate limit is used up${when}${tokenHint} to raise it`, 'rate-limited', response.status);
  }
  if (response.status === 401) {
    throw new GitHubRequestError('GitHub rejected the GITHUB_TOKEN (401)', 'unauthorized', 401);
  }
  if (response.status === 404) {
    throw new GitHubRequestError(`${url} was not found: it doesn't exist or it's private${tokenHint ? `${tokenHint} with access to it` : ''}`, 'not-found', 404);
  }
  throw new GitHubRequestError(`GitHub request to ${url} failed: ${response.status} ${response.statusText}`, 'failed', response.status);
}

export interface GitHubReleaseAsset {
  name: string;
  /** API URL; with a token it downloads assets of private repositories too */
  url?: string;
  browser_download_url: string;
}

/** Downloads a release asset: through the API when authenticated, else its public download URL. */
export function fetchReleaseAsset(asset: GitHubReleaseAsset): Promise<Response> {
  return githubToken() && asset.url
    ? githubFetch(asset.url, 'application/octet-stream')
    : githubFetch(asset.browser_download_url, 'application/octet-stream');
}

/** A file at a tag: the contents API when authenticated (private repositories), else raw.githubusercontent.com. */
export function fetchRepoFile(owner: string, repo: string, ref: string, file: string): Promise<Response> {
  return githubToken()
    ? githubFetch(`https://api.github.com/repos/${owner}/${repo}/contents/${file}?ref=${encodeURIComponent(ref)}`, 'application/vnd.github.raw+json')
    : githubFetch(`https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(ref)}/${file}`, 'application/json');
}
