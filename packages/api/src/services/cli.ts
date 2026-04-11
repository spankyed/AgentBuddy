import { GitRepository } from '@/systems/code/services/git'
import * as ghCli from '@/systems/code/services/gh-cli'
import { repository } from '@/repository'
import type { GitStatusFile, GhPullRequest, GhPRComment, GhReviewThread } from '@/systems/code/types'
import { claudeCode } from '@/services/claude-code'
import type { QueryOptions, QueryHandle, AuthStatus, SessionInfo, SessionListOptions } from '@/services/claude-code'

interface CodeSettings {
  defaultBaseDirectory?: string | null
  lastDirectoryOpened?: string | null
}

export interface CliServiceType {
  git: {
    commit(message: string): Promise<void>
    getStatus(): Promise<GitStatusFile[]>
    getCurrentBranch(): Promise<string>
    getWorkingDir(): string
    /**
     * Return the unified diff for the working copy vs HEAD. Pass a list of
     * paths to restrict to specific files; omit to get all changes. Used by
     * the Claude Code chat action to assemble a `diff` artifact after file-
     * mutating tool calls (Write/Edit/NotebookEdit).
     */
    getDiff(paths?: string[]): Promise<string>
  }
  gh: {
    getPRForBranch(branch?: string): Promise<GhPullRequest | null>
    getPRDetails(number: number, repo?: { owner: string; name: string }): Promise<GhPullRequest & { comments: GhPRComment[] }>
    getReviewThreads(number: number, repo?: { owner: string; name: string }): Promise<GhReviewThread[]>
  }
  /**
   * Claude Code wrapper. Highlights only — the full surface (sessions, mcp,
   * plugins, skills, …) is available via `import { claudeCode } from
   * '@/services/claude-code'`.
   */
  claudeCode: {
    query(opts: Omit<QueryOptions, 'cwd'> & { cwd?: string }): Promise<QueryHandle>
    version(): Promise<string>
    authStatus(): Promise<AuthStatus>
    listSessions(opts?: SessionListOptions): Promise<SessionInfo[]>
    getWorkingDir(): string
  }
}

function createCliService(): CliServiceType {
  let gitRepo: GitRepository | null = null
  let lastCwd: string | null = null

  function resolveCwd(): string {
    const codeSettings = repository.settingsQueries.getPluginSettings('code') as CodeSettings | undefined
    const cwd = codeSettings?.defaultBaseDirectory || codeSettings?.lastDirectoryOpened || null
    if (!cwd) {
      throw new Error('No project directory configured. Open a directory in the Code panel first.')
    }
    return cwd
  }

  function getGitRepo(): GitRepository {
    const cwd = resolveCwd()
    if (!gitRepo || lastCwd !== cwd) {
      gitRepo = new GitRepository(cwd)
      lastCwd = cwd
    }
    return gitRepo
  }

  return {
    git: {
      async commit(message: string): Promise<void> {
        await getGitRepo().commit(message)
      },
      async getStatus(): Promise<GitStatusFile[]> {
        return getGitRepo().getStatus()
      },
      async getCurrentBranch(): Promise<string> {
        return getGitRepo().getCurrentBranch()
      },
      getWorkingDir(): string {
        return resolveCwd()
      },
      async getDiff(paths?: string[]): Promise<string> {
        const repo = getGitRepo()
        if (!paths || paths.length === 0) {
          return repo.getDiff()
        }
        // GitRepository.getDiff takes one file path at a time; concatenate
        // the per-file diffs so the caller gets a single unified-diff blob
        // they can split on `^diff --git a/…`.
        const chunks = await Promise.all(paths.map(p => repo.getDiff(p)))
        return chunks.filter(Boolean).join('\n')
      },
    },
    gh: {
      async getPRForBranch(branch?: string): Promise<GhPullRequest | null> {
        const cwd = resolveCwd()
        const branchName = branch || await getGitRepo().getCurrentBranch()
        return ghCli.getPRForBranch(cwd, branchName)
      },
      async getPRDetails(number: number, repo?: { owner: string; name: string }): Promise<GhPullRequest & { comments: GhPRComment[] }> {
        const cwd = resolveCwd()
        return ghCli.getPRDetails(cwd, number, repo)
      },
      async getReviewThreads(number: number, repo?: { owner: string; name: string }): Promise<GhReviewThread[]> {
        const cwd = resolveCwd()
        return ghCli.getReviewThreads(cwd, number, repo)
      },
    },
    claudeCode: {
      query(opts) {
        const cwd = opts.cwd ?? resolveCwd()
        return claudeCode.query({ ...opts, cwd })
      },
      version() {
        return claudeCode.system.version()
      },
      authStatus() {
        return claudeCode.auth.status()
      },
      listSessions(opts) {
        const cwd = opts?.cwd ?? resolveCwd()
        return claudeCode.sessions.list({ ...opts, cwd })
      },
      getWorkingDir() {
        return resolveCwd()
      },
    },
  }
}

export const cliService = createCliService()
