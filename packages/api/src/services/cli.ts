import { GitRepository } from '@/systems/code/services/git'
import * as ghCli from '@/systems/code/services/gh-cli'
import { repository } from '@/repository'
import type { GitStatusFile, GhPullRequest, GhPRComment, GhReviewThread } from '@/systems/code/types'
import { claudeCode } from '@/services/claude-code'
import type { QueryOptions, QueryHandle, AuthStatus } from '@/services/claude-code'

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
      getWorkingDir() {
        return resolveCwd()
      },
    },
  }
}

export const cliService = createCliService()
