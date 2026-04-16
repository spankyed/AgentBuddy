import { GitRepository } from '@/systems/code/services/git'
import * as ghCli from '@/systems/code/services/gh-cli'
import { repository } from '@/repository'
import type { GitStatusFile, GhPullRequest, GhPRComment, GhReviewThread } from '@/systems/code/types'
import { claudeCode } from '@/services/claude-code'
import type { QueryOptions, QueryHandle, AuthStatus, SessionInfo, SessionListOptions, SessionTranscriptEntry, SessionViewOptions } from '@/services/claude-code'
import type { ExecOnceOptions, ExecOnceResult } from '@/services/claude-code/runner'
import { storeHandle, getHandle, clearHandle } from '@/services/claude-code/handle-store'

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
    /**
     * Parse a session's JSONL transcript into an in-memory array of entries.
     * Used by `CC: Handle Rewind` to retroactively backfill `context.cliUuid`
     * on pre-existing user messages from Claude's own session file.
     * `cwd` defaults to the configured project directory.
     */
    viewSession(id: string, opts?: Omit<SessionViewOptions, 'cwd'> & { cwd?: string }): Promise<SessionTranscriptEntry[]>
    getWorkingDir(): string
    /** Store a live query handle so other actions can write control_responses. */
    storeHandle(key: string, handle: QueryHandle): void
    /** Retrieve a stored query handle by key (typically threadId). */
    getHandle(key: string): QueryHandle | undefined
    /** Clear a stored handle (call on query end to avoid leaking references). */
    clearHandle(key: string): void
    /**
     * Low-level one-shot CLI invocation. Used by `CC: Handle Revert` to run
     * `claude --resume <sid> --rewind-files <uuid>` for file-rewind on revert.
     * `cwd` defaults to the configured project directory.
     */
    exec(args: readonly string[], opts?: Omit<ExecOnceOptions, 'cwd'> & { cwd?: string }): Promise<ExecOnceResult>
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
        return repo.getDiffMulti(paths)
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
        // Default replayUserMessages=true so the CLI emits post-persistence
        // user replay events (SDKUserMessageReplay) carrying the canonical
        // `uuid`. Without this flag, only the input-echo user event is
        // emitted — which has no uuid — and stream-consumer's live
        // `context.cliUuid` write for user messages never fires. Gated
        // in Claude at src/main.tsx:1944-1950 (cliArgs.replayUserMessages
        // || UDS_INBOX feature). Callers can still override by passing
        // `replayUserMessages: false` explicitly (spread order honors it).
        return claudeCode.query({ replayUserMessages: true, ...opts, cwd })
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
      viewSession(id, opts) {
        const cwd = opts?.cwd ?? resolveCwd()
        return claudeCode.sessions.view(id, { ...opts, cwd })
      },
      getWorkingDir() {
        return resolveCwd()
      },
      storeHandle,
      getHandle,
      clearHandle,
      exec(args, opts) {
        const cwd = opts?.cwd ?? resolveCwd()
        return claudeCode.exec(args, { ...opts, cwd })
      },
    },
  }
}

export const cliService = createCliService()
