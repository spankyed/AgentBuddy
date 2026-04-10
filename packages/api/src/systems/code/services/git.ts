import { execFile } from 'child_process'
import { promisify } from 'util'
import * as path from 'path'
import * as fs from 'fs/promises'
import { simpleGit, SimpleGit } from 'simple-git'
import { GitStatusFile, StashEntry } from '../types'

const execFileAsync = promisify(execFile)

/** Thrown when a stash apply/pop succeeds partially but leaves conflicts. */
export class StashConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StashConflictError'
  }
}

const IMAGE_MIME_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  webp: 'image/webp',
  tiff: 'image/tiff',
  tif: 'image/tiff',
  bmp: 'image/bmp',
}

function getImageMimeType(filePath: string): string | null {
  const ext = path.extname(filePath).slice(1).toLowerCase()
  return IMAGE_MIME_TYPES[ext] || null
}

interface CachedResult<T> {
  data: T
  timestamp: number
}

/** Detect whether a thrown git error message indicates a stash conflict. */
function isStashConflictMessage(msg: string): boolean {
  return /CONFLICT|Merge conflict/i.test(msg)
}

/** Characters allowed in a git branch name (used to guard command injection). */
const VALID_BRANCH_NAME = /^[a-zA-Z0-9._/-]+$/

/** Map a single porcelain XY character (M, A, D, R, C, ?, T, U) to our status. */
function mapPorcelainCode(code: string): GitStatusFile['status'] {
  const letter = code.charAt(0)
  switch (letter) {
    case 'M': return 'modified'
    case 'A': return 'added'
    case 'D': return 'deleted'
    case 'R': return 'renamed'
    case 'C': return 'copied'
    case '?': return 'untracked'
    case 'T': return 'typechange'
    case 'U': return 'unmerged'
    default: return 'modified'
  }
}

export class GitRepository {
  private cache = new Map<string, CachedResult<any>>()
  private readonly CACHE_TTL = 5000 // 5 seconds
  private readonly PARENT_BRANCH_SEARCH_DEPTH = 25
  /** Serializes the entire JS body of each public method (git calls,
   * fs ops, cache mutations) so composite multi-step operations stay
   * atomic. simple-git's maxConcurrentProcesses:1 only serializes the
   * git process spawns themselves; it does NOT guard multi-step JS
   * sequences like getStatus → fs.unlink → git.checkout → cache.delete
   * inside revertFiles. Do not remove. */
  private commandQueue: Promise<void> = Promise.resolve()
  private _writeInProgress = 0
  private _writeCompleteCallbacks: (() => void)[] = []
  private _lastFetchTimestamp = 0
  private _autoFetchEnabled = false
  private _fetchThrottleMs = 180_000
  private _forceFetchNext = false
  /** simple-git instance. maxConcurrentProcesses:1 serializes git
   * process spawns within this instance; JS-level atomicity is provided
   * by `enqueueCommand` (see above). */
  private git: SimpleGit

  constructor(private workingDirectory: string) {
    this.validateWorkingDirectory(workingDirectory)
    this.git = simpleGit({
      baseDir: workingDirectory,
      binary: 'git',
      maxConcurrentProcesses: 1,
    })
  }

  getWorkingDir(): string {
    return this.workingDirectory
  }

  setFetchConfig(enabled: boolean, intervalSeconds: number): void {
    this._autoFetchEnabled = enabled
    this._fetchThrottleMs = intervalSeconds * 1000
  }

  get isWriteInProgress(): boolean {
    return this._writeInProgress > 0
  }

  /** Register a one-shot callback that fires when all pending writes finish. */
  onWriteComplete(callback: () => void): void {
    if (!this.isWriteInProgress) {
      callback()
    } else {
      this._writeCompleteCallbacks.push(callback)
    }
  }

  /** Run fn serially on the command queue. See `commandQueue` field doc. */
  private enqueueCommand<T>(fn: () => Promise<T>): Promise<T> {
    const op = this.commandQueue.then(fn, fn)
    this.commandQueue = op.then(() => {}, () => {})
    return op
  }

  /** Wrap a write operation to track write-in-progress for watcher suppression. */
  private async withWriteFlag<T>(fn: () => Promise<T>): Promise<T> {
    this._writeInProgress++
    try {
      return await fn()
    } finally {
      this._writeInProgress--
      if (this._writeInProgress === 0 && this._writeCompleteCallbacks.length > 0) {
        const callbacks = this._writeCompleteCallbacks.splice(0)
        for (const cb of callbacks) {
          try { cb() } catch { /* ignore */ }
        }
      }
    }
  }

  /** Run a read op serialized on the queue. Throws with `errMsg` as fallback
   * if the inner function throws a message-less error. */
  private run<T>(errMsg: string, fn: () => Promise<T>): Promise<T> {
    return this.enqueueCommand(async () => {
      try { return await fn() }
      catch (err: any) { throw new Error(err?.message || errMsg) }
    })
  }

  /** Run a read op serialized on the queue. Returns `fallback` on any error. */
  private runSafe<T>(fallback: T, fn: () => Promise<T>): Promise<T> {
    return this.enqueueCommand(async () => {
      try { return await fn() }
      catch { return fallback }
    })
  }

  /** Run a write op: write flag + queue + error wrapping. Cache invalidation
   * stays explicit at each call site — some methods clear only `'status'`
   * while others clear the whole cache. */
  private runWrite<T>(errMsg: string, fn: () => Promise<T>): Promise<T> {
    return this.withWriteFlag(() => this.enqueueCommand(async () => {
      try { return await fn() }
      catch (err: any) { throw new Error(err?.message || errMsg) }
    }))
  }

  private validateWorkingDirectory(dir: string): void {
    if (!path.isAbsolute(dir)) {
      throw new Error('Working directory must be an absolute path')
    }
    // .git existence is validated lazily via isGitRepository() / first command
  }

  private getCached<T>(key: string): T | null {
    const cached = this.cache.get(key)
    if (!cached) return null
    
    const now = Date.now()
    if (now - cached.timestamp > this.CACHE_TTL) {
      this.cache.delete(key)
      return null
    }
    
    return cached.data
  }
  
  private setCached<T>(key: string, data: T): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    })
  }
  
  clearCache(): void {
    this.cache.clear()
  }

  /** Strip the working-directory prefix from an absolute path, leaving
   * already-relative paths untouched. Intentionally NOT `path.relative()`
   * — that would return `..` segments for paths outside the working dir,
   * while we want a pass-through. */
  private toRelativePath(p: string): string {
    return p.startsWith(this.workingDirectory)
      ? p.slice(this.workingDirectory.length + 1)
      : p
  }

  /** Build a git rev reference for a branch + path. Files with `:` or
   * a leading `-` need `branch:./path` syntax so they're not interpreted
   * as options or as path-spec separators. */
  private buildBranchRef(branch: string, filePath: string): string {
    return (filePath.includes(':') || filePath.startsWith('-'))
      ? `${branch}:./${filePath}`
      : `${branch}:${filePath}`
  }

  private async isDirectory(filePath: string): Promise<boolean> {
    try {
      const fullPath = path.join(this.workingDirectory, filePath)
      const stats = await fs.stat(fullPath)
      return stats.isDirectory()
    } catch {
      return false
    }
  }

  /** Unqueued — safe to call from inside an existing `enqueueCommand` scope. */
  private async _getUntrackedFilesInDirectoryInternal(dirPath: string): Promise<GitStatusFile[]> {
    try {
      const output = await this.git.raw(['ls-files', '--others', '--exclude-standard', dirPath])
      return output.trim().split('\n').filter(Boolean).map(filePath => ({
        path: filePath,
        status: 'untracked' as const,
        staged: false,
      }))
    } catch {
      return []
    }
  }
  
  async getCurrentBranch(): Promise<string> {
    return this.run('Failed to get current branch', async () => {
      const output = await this.git.revparse(['--abbrev-ref', 'HEAD'])
      return output.trim()
    })
  }

  async getStatus(): Promise<GitStatusFile[]> {
    const cached = this.getCached<GitStatusFile[]>('status')
    if (cached) return cached
    return this.enqueueCommand(() => this._getStatusInternal())
  }

  /** Compute current status directly — no outer queue wrap. Write methods
   * already running inside `enqueueCommand` must call THIS, not `getStatus`,
   * to avoid nesting `enqueueCommand` (which deadlocks the promise queue). */
  private async _getStatusInternal(): Promise<GitStatusFile[]> {
    const cached = this.getCached<GitStatusFile[]>('status')
    if (cached) return cached

    const status = await this.git.status()
    const files: GitStatusFile[] = []

    // Conflicts are first-class on simple-git's StatusResult. Emit one row
    // per conflicted file — no double-counting across staged/unstaged.
    const conflictSet = new Set(status.conflicted)

    // Map of new path -> original path for renames, from typed `renamed`.
    const renameMap = new Map<string, string>()
    for (const r of status.renamed) {
      renameMap.set(r.to, r.from)
    }

    for (const f of status.files) {
      // simple-git sometimes encodes renames in the path as "from -> to".
      // Normalize to just the new path + originalPath.
      let filePath = f.path
      let originalPath: string | undefined
      const arrow = ' -> '
      const arrowIdx = filePath.indexOf(arrow)
      if (arrowIdx !== -1) {
        originalPath = filePath.slice(0, arrowIdx)
        filePath = filePath.slice(arrowIdx + arrow.length)
      } else if (renameMap.has(filePath)) {
        originalPath = renameMap.get(filePath)
      }

      if (conflictSet.has(filePath) || conflictSet.has(f.path)) {
        files.push({
          path: filePath,
          status: 'unmerged',
          staged: false,
        })
        continue
      }

      const indexStatus = f.index
      const workingStatus = f.working_dir

      if (indexStatus !== ' ' && indexStatus !== '?') {
        files.push({
          path: filePath,
          status: mapPorcelainCode(indexStatus),
          staged: true,
          originalPath,
        })
      }

      if (workingStatus !== ' ' && workingStatus !== '?') {
        files.push({
          path: filePath,
          status: mapPorcelainCode(workingStatus),
          staged: false,
        })
      }

      if (indexStatus === '?' && workingStatus === '?') {
        if (!files.some(x => x.path === filePath)) {
          files.push({
            path: filePath,
            status: 'untracked',
            staged: false,
          })
        }
      }
    }

    // Expand untracked directories to their individual files.
    const expandedFiles: GitStatusFile[] = []
    for (const file of files) {
      if (file.status === 'untracked' && await this.isDirectory(file.path)) {
        const dirFiles = await this._getUntrackedFilesInDirectoryInternal(file.path)
        expandedFiles.push(...dirFiles)
      } else {
        expandedFiles.push(file)
      }
    }

    this.setCached('status', expandedFiles)
    return expandedFiles
  }

  private async isBinaryFile(filePath: string): Promise<boolean> {
    // Check cache first
    const cacheKey = `binary:${filePath}`
    const cached = this.getCached<boolean>(cacheKey)
    if (cached !== null) return cached

    // First, try git's built-in binary detection via gitattributes.
    try {
      const output = await this.git.raw(['check-attr', 'diff', '--', filePath])
      const isBinary = output.includes(': diff: binary') ||
                       output.includes(': diff: -diff')
      if (isBinary) {
        this.setCached(cacheKey, true)
        return true
      }
    } catch { /* non-fatal, fall through to numstat */ }

    // If git doesn't say it's binary, check if it's text according to numstat.
    // Binary files show as "-\t-\tfilename".
    try {
      const output = await this.git.raw(['diff', '--numstat', '/dev/null', filePath])
      if (output.startsWith('-\t-\t')) {
        this.setCached(cacheKey, true)
        return true
      }
    } catch { /* non-fatal, fall through to heuristic */ }
    
    // Fallback to quick heuristic for untracked files
    try {
      const stats = await fs.stat(filePath)
      // Large files are likely binary
      if (stats.size > 1024 * 1024) {
        this.setCached(cacheKey, true)
        return true // > 1MB
      }
      
      // Only read first 512 bytes for performance
      const buffer = Buffer.alloc(512)
      const fd = await fs.open(filePath, 'r')
      try {
        const { bytesRead } = await fd.read(buffer, 0, 512, 0)
        if (bytesRead === 0) {
          this.setCached(cacheKey, false)
          return false
        }
        
        // Check for BOM (Byte Order Mark) for UTF-16/UTF-32
        if (bytesRead >= 2) {
          const bom16LE = buffer[0] === 0xFF && buffer[1] === 0xFE
          const bom16BE = buffer[0] === 0xFE && buffer[1] === 0xFF
          if (bom16LE || bom16BE) {
            this.setCached(cacheKey, false)
            return false // UTF-16 text file
          }
        }
        
        if (bytesRead >= 4) {
          const bom32LE = buffer[0] === 0xFF && buffer[1] === 0xFE && buffer[2] === 0x00 && buffer[3] === 0x00
          const bom32BE = buffer[0] === 0x00 && buffer[1] === 0x00 && buffer[2] === 0xFE && buffer[3] === 0xFF
          if (bom32LE || bom32BE) {
            this.setCached(cacheKey, false)
            return false // UTF-32 text file
          }
        }
        
        // Check for null bytes (but skip if it might be UTF-16/32)
        let nullCount = 0
        for (let i = 0; i < bytesRead; i++) {
          if (buffer[i] === 0) nullCount++
        }
        
        // If many nulls but not in UTF-16/32 pattern, it's binary
        if (nullCount > bytesRead * 0.3) {
          this.setCached(cacheKey, true)
          return true
        }
        
        // Check for high ratio of non-printable characters
        let nonPrintable = 0
        for (let i = 0; i < bytesRead; i++) {
          const byte = buffer[i]
          if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
            nonPrintable++
          }
        }
        
        const isBinary = nonPrintable / bytesRead > 0.3
        this.setCached(cacheKey, isBinary)
        return isBinary
      } finally {
        await fd.close()
      }
    } catch {
      this.setCached(cacheKey, false)
      return false
    }
  }

  async getDiff(filePath?: string, staged: boolean = false): Promise<string> {
    if (filePath) {
      const status = await this.getStatus()
      const fileStatus = status.find(f => f.path === filePath && f.staged === staged)
      if (fileStatus?.status === 'untracked') {
        return this.getUntrackedFileDiff(filePath)
      }
    }

    const args: string[] = ['--binary', '-M']
    if (staged) args.push('--cached')
    if (filePath) args.push('--', filePath)

    return this.run('Failed to get diff', () => this.git.diff(args))
  }

  /** Build a synthetic unified diff for an untracked file. Handles
   * directory, binary, and text sub-cases. */
  private async getUntrackedFileDiff(filePath: string): Promise<string> {
    if (await this.isDirectory(filePath)) {
      return `diff --git a/${filePath} b/${filePath}\n`
        + `new directory\n`
        + `Unable to show diff for directory\n`
    }

    const fullPath = path.join(this.workingDirectory, filePath)
    const relativePath = path.relative(this.workingDirectory, fullPath)

    if (await this.isBinaryFile(fullPath)) {
      return `diff --git a/${relativePath} b/${relativePath}\n`
        + `new file mode 100644\n`
        + `index 0000000..0000000\n`
        + `Binary files /dev/null and b/${relativePath} differ\n`
    }

    try {
      const content = await fs.readFile(fullPath, 'utf8')
      const lines = content.split(/\r?\n/) // Handle CRLF
      return `diff --git a/${relativePath} b/${relativePath}\n`
        + `new file mode 100644\n`
        + `index 0000000..0000000\n`
        + `--- /dev/null\n`
        + `+++ b/${relativePath}\n`
        + `@@ -0,0 +1,${lines.length} @@\n`
        + lines.map(line => `+${line}`).join('\n')
    } catch (error) {
      throw new Error(`Failed to read untracked file: ${error}`)
    }
  }

  async getFileContent(filePath: string, version: 'HEAD' | 'working' | 'index' = 'working'): Promise<string> {
    const relativePath = this.toRelativePath(filePath)

    if (version === 'working') {
      // Working-tree reads don't touch the git index — no queue needed
      try {
        if (await this.isDirectory(relativePath)) {
          return ''
        }
        const fullPath = path.join(this.workingDirectory, relativePath)
        return await fs.readFile(fullPath, 'utf8')
      } catch (error) {
        throw new Error(`Failed to read file: ${error}`)
      }
    }

    const ref = version === 'HEAD' ? `HEAD:${relativePath}` : `:${relativePath}`
    return this.runSafe('', () => this.git.show([ref]))
  }

  /**
   * Read a file as a base64 data URL if it's an image, otherwise return text content.
   * For git refs (HEAD/index), reads binary output from `git show`.
   */
  async getFileContentAsDataUrl(filePath: string, version: 'HEAD' | 'working' | 'index' = 'working'): Promise<string> {
    const mimeType = getImageMimeType(filePath)
    if (!mimeType) {
      return this.getFileContent(filePath, version)
    }

    const relativePath = this.toRelativePath(filePath)

    if (version === 'working') {
      try {
        const fullPath = path.join(this.workingDirectory, relativePath)
        const buffer = await fs.readFile(fullPath)
        return `data:${mimeType};base64,${buffer.toString('base64')}`
      } catch {
        return ''
      }
    }

    // For HEAD/index, use git show with binary-safe output
    const ref = version === 'HEAD' ? `HEAD:${relativePath}` : `:${relativePath}`
    try {
      const buffer = await this.executeGitCommandBinary(['show', ref])
      if (!buffer || buffer.length === 0) return ''
      return `data:${mimeType};base64,${buffer.toString('base64')}`
    } catch {
      return ''
    }
  }

  /**
   * Read a file from a branch as a base64 data URL if it's an image.
   */
  async getFileContentFromBranchAsDataUrl(filePath: string, branch: string): Promise<string> {
    const mimeType = getImageMimeType(filePath)
    if (!mimeType) {
      return this.getFileContentFromBranch(filePath, branch)
    }

    try {
      const buffer = await this.executeGitCommandBinary(['show', this.buildBranchRef(branch, filePath)])
      if (!buffer || buffer.length === 0) return ''
      return `data:${mimeType};base64,${buffer.toString('base64')}`
    } catch {
      return ''
    }
  }

  /** Check if a file path is an image based on extension. */
  isImageFile(filePath: string): boolean {
    return getImageMimeType(filePath) !== null
  }

  /** Execute a git command and return raw binary buffer output. */
  private executeGitCommandBinary(args: string[]): Promise<Buffer> {
    return this.enqueueCommand(async () => {
      const colorlessArgs = ['-c', 'color.ui=never', ...args]
      const { stdout } = await execFileAsync('git', colorlessArgs, {
        cwd: this.workingDirectory,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
        maxBuffer: 10 * 1024 * 1024,
        encoding: 'buffer' as any
      })
      return stdout as unknown as Buffer
    })
  }

  async stageFiles(filePaths: string[]): Promise<void> {
    if (filePaths.length === 0) return
    await this.runWrite('Failed to stage files', async () => {
      await this.git.add(filePaths)
      this.cache.delete('status')
    })
  }

  async unstageFiles(filePaths: string[]): Promise<void> {
    if (filePaths.length === 0) return
    await this.runWrite('Failed to unstage files', async () => {
      await this.git.reset(['HEAD', ...filePaths])
      this.cache.delete('status')
    })
  }

  async revertFiles(filePaths: string[]): Promise<void> {
    if (filePaths.length === 0) return
    await this.runWrite('Failed to revert files', async () => {
      // Unqueued status read — calling `getStatus` here would re-enter
      // `enqueueCommand` and deadlock.
      const status = await this._getStatusInternal()
      const statusMap = new Map(status.map(f => [f.path, f.status]))

      const untrackedPaths: string[] = []
      const unmergedPaths: string[] = []
      const trackedPaths: string[] = []
      for (const p of filePaths) {
        const s = statusMap.get(p)
        if (s === 'untracked') untrackedPaths.push(p)
        else if (s === 'unmerged') unmergedPaths.push(p)
        else trackedPaths.push(p)
      }

      // Untracked files: plain filesystem delete.
      for (const filePath of untrackedPaths) {
        await fs.unlink(path.join(this.workingDirectory, filePath))
      }

      // Unmerged files need `checkout HEAD --` to clear the conflict state;
      // plain `checkout --` refuses unmerged paths.
      if (unmergedPaths.length > 0) {
        await this.git.checkout(['HEAD', '--', ...unmergedPaths])
      }
      if (trackedPaths.length > 0) {
        await this.git.checkout(['--', ...trackedPaths])
      }

      this.cache.delete('status')
    })
  }

  async commit(message: string): Promise<void> {
    if (!message.trim()) {
      throw new Error('Commit message cannot be empty')
    }
    await this.runWrite('Failed to commit', async () => {
      await this.git.commit(message)
    })
  }

  async isGitRepository(): Promise<boolean> {
    return this.runSafe(false, () => this.git.checkIsRepo())
  }

  async hasUncommittedChanges(): Promise<boolean> {
    const status = await this.getStatus()
    return status.length > 0
  }

  async getStagedFiles(): Promise<GitStatusFile[]> {
    const status = await this.getStatus()
    return status.filter(file => file.staged)
  }

  async getUpstreamBranch(): Promise<string | null> {
    return this.enqueueCommand(async () => {
      try {
        const output = await this.git.revparse(['--abbrev-ref', '--symbolic-full-name', '@{u}'])
        const upstream = output.trim()
        const parts = upstream.split('/')
        if (parts.length >= 2) {
          return parts.slice(1).join('/')
        }
        return null
      } catch (err: any) {
        const msg = String(err?.message || '')
        if (msg.includes('no upstream configured') ||
            msg.includes('@{u}') ||
            msg.includes('HEAD has no upstream')) {
          return null
        }
        throw new Error(`Failed to get upstream branch: ${msg}`)
      }
    })
  }

  async getBaseBranch(options?: { preferUpstream?: boolean }): Promise<string> {
    const preferUpstream = options?.preferUpstream !== false

    const cacheKey = preferUpstream ? 'baseBranch:preferUpstream' : 'baseBranch'
    const cached = this.getCached<string>(cacheKey)
    if (cached) return cached

    if (preferUpstream) {
      try {
        const upstream = await this.getUpstreamBranch()
        if (upstream) {
          this.setCached(cacheKey, upstream)
          return upstream
        }
      } catch (error) {
        console.warn('Failed to get upstream branch:', error)
      }
    }

    return this.enqueueCommand(async () => {
      // Try to read origin/HEAD symbolic ref.
      try {
        const output = await this.git.raw(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])
        const branch = output.trim().replace(/^origin\//, '')
        if (branch) {
          this.setCached(cacheKey, branch)
          return branch
        }
      } catch { /* no origin/HEAD — fall through */ }

      // Fallback: probe common base-branch names.
      for (const branch of ['main', 'master', 'develop', 'development']) {
        try {
          await this.git.revparse(['--verify', branch])
          this.setCached(cacheKey, branch)
          return branch
        } catch { /* not found, try next */ }
      }

      throw new Error('Could not determine base branch')
    })
  }

  async getPRBaseBranch(): Promise<string> {
    const cached = this.getCached<string>('prBaseBranch')
    if (cached) return cached

    const defaultBase = await this.getBaseBranch({ preferUpstream: false })

    // Try to find a closer parent branch via merge-base distance
    try {
      const closestParent = await this.findClosestParentBranch(defaultBase)
      if (closestParent) {
        this.setCached('prBaseBranch', closestParent)
        return closestParent
      }
    } catch {
      // Fall through to default
    }

    this.setCached('prBaseBranch', defaultBase)
    return defaultBase
  }

  /**
   * Find the closest parent branch by comparing merge-base distances.
   * When branching feature-B from feature-A, feature-A will have a much
   * smaller commit distance than main/master.
   */
  private async findClosestParentBranch(defaultBase: string): Promise<string | null> {
    const currentBranch = await this.getCurrentBranch()

    // Only check branches whose tip is within recent commits AND merged into HEAD
    const candidates = await this.getNearbyMergedBranches(this.PARENT_BRANCH_SEARCH_DEPTH)
    const filtered = candidates.filter(b =>
      b !== currentBranch && b !== defaultBase && b !== 'HEAD'
    )
    if (filtered.length === 0) return null

    // For merged branches, tip = merge-base, so rev-list --count <branch>..HEAD gives distance directly
    const [defaultDistance, ...distances] = await Promise.all([
      this.getCommitDistance(defaultBase),
      ...filtered.map(b => this.getCommitDistance(b)),
    ])

    if (defaultDistance <= 0) return null

    let closestBranch: string | null = null
    let closestDistance = defaultDistance

    for (let i = 0; i < filtered.length; i++) {
      const distance = distances[i]
      if (distance > 0 && distance < closestDistance) {
        closestDistance = distance
        closestBranch = filtered[i]
      }
    }

    return closestBranch
  }

  private async getCommitDistance(branch: string): Promise<number> {
    return this.runSafe(Infinity, async () => {
      const output = await this.git.raw(['rev-list', '--count', `${branch}..HEAD`])
      const n = parseInt(output.trim(), 10)
      return Number.isFinite(n) ? n : Infinity
    })
  }

  private async getNearbyMergedBranches(depth: number): Promise<string[]> {
    // The primary form with `HEAD~N` errors on shallow history; fall back
    // to all merged branches in that case. Both branches are swallowed to
    // an empty list on final failure.
    return this.runSafe<string[]>([], async () => {
      try {
        const output = await this.git.raw([
          'branch', '--merged', 'HEAD', '--contains', `HEAD~${depth}`, '--format=%(refname:short)',
        ])
        return output.trim().split('\n').filter(Boolean)
      } catch {
        const fallback = await this.git.raw([
          'branch', '--merged', 'HEAD', '--format=%(refname:short)',
        ])
        return fallback.trim().split('\n').filter(Boolean)
      }
    })
  }

  async getBranchDiff(baseBranch: string, targetBranch?: string): Promise<GitStatusFile[]> {
    const target = targetBranch || 'HEAD'

    return this.run('Failed to get branch diff', async () => {
      // NUL-separated, with rename/copy detection. Pass through `.raw()`
      // because simple-git's diff helpers don't surface the -z form we need.
      const output = await this.git.raw(['diff', '--name-status', '-z', '-M', '-C', `${baseBranch}...${target}`])
      const files: GitStatusFile[] = []
      const parts = output.split('\0').filter(Boolean)

      for (let i = 0; i < parts.length; ) {
        const statusPart = parts[i++]
        if (!statusPart || i >= parts.length) break

        const status = mapPorcelainCode(statusPart)
        const p = parts[i++]

        if (!p) continue

        // For renames and copies, there's a second path
        if ((statusPart.startsWith('R') || statusPart.startsWith('C')) && i < parts.length && parts[i]) {
          const originalPath = p
          const newPath = parts[i++]
          files.push({
            path: newPath,
            status,
            staged: false,
            originalPath,
          })
        } else {
          files.push({
            path: p,
            status,
            staged: false,
          })
        }
      }

      return files
    })
  }

  async getFileDiffBetweenBranches(filePath: string, baseBranch: string, targetBranch?: string): Promise<string> {
    const target = targetBranch || 'HEAD'

    if (!VALID_BRANCH_NAME.test(baseBranch) || !VALID_BRANCH_NAME.test(target)) {
      throw new Error('Invalid branch name')
    }

    return this.run('Failed to get file diff between branches', () =>
      this.git.raw(['diff', '--binary', '-M', `${baseBranch}...${target}`, '--', filePath])
    )
  }

  async getFileContentFromBranch(filePath: string, branch: string): Promise<string> {
    // File might not exist in that branch — swallow to empty.
    const ref = this.buildBranchRef(branch, filePath)
    return this.runSafe('', () => this.git.show([ref]))
  }

  async fetchRemoteBranch(branch: string): Promise<void> {
    // Best-effort — errors are intentionally swallowed.
    return this.withWriteFlag(() => this.enqueueCommand(async () => {
      try { await this.git.fetch('origin', branch) } catch { /* ignore */ }
    }))
  }

  async deleteRemoteBranch(branch: string): Promise<void> {
    await this.runWrite('Failed to delete remote branch', async () => {
      await this.git.push('origin', branch, ['--delete'])
    })
  }

  async getAllBranches(): Promise<string[]> {
    return this.run('Failed to get branches', async () => {
      // simple-git's branch() parses into a BranchSummary with typed `all`.
      // Sort-by-committerdate has to be specified via args.
      const summary = await this.git.branch(['-a', '--no-color', '--sort=-committerdate'])
      const seen = new Set<string>()
      const result: string[] = []
      for (const raw of summary.all) {
        if (raw.includes('HEAD ->')) continue // skip HEAD pointer
        const name = raw.startsWith('remotes/origin/')
          ? raw.slice('remotes/origin/'.length)
          : raw
        if (!name || seen.has(name)) continue
        seen.add(name)
        result.push(name)
      }
      return result
    })
  }

  async checkoutBranch(branchName: string): Promise<void> {
    if (!branchName.trim()) {
      throw new Error('Branch name cannot be empty')
    }
    
    if (!VALID_BRANCH_NAME.test(branchName)) {
      throw new Error('Invalid branch name. Branch names can only contain letters, numbers, dots, underscores, hyphens, and forward slashes.')
    }
    
    return this.withWriteFlag(() => this.enqueueCommand(async () => {
      // Try to checkout the branch.
      try {
        await this.git.checkout(branchName)
      } catch (err: any) {
        const msg = String(err?.message || '')

        if (msg.includes('pathspec') && msg.includes('did not match')) {
          // Branch doesn't exist locally — try to create tracking from remote.
          try {
            await this.git.checkout(['-b', branchName, `origin/${branchName}`])
          } catch {
            // If that fails too, just create a new local branch.
            try {
              await this.git.checkout(['-b', branchName])
            } catch (err3: any) {
              throw new Error(err3?.message || `Failed to create branch: ${branchName}`)
            }
          }
        } else if (msg.includes('Your local changes to the following files would be overwritten')) {
          throw new Error('Cannot switch branches: Your uncommitted changes conflict with files in the target branch. Please commit, stash, or discard your changes first.')
        } else {
          throw new Error(msg || `Failed to checkout branch: ${branchName}`)
        }
      }

      // After successful checkout, pull latest (best-effort). Use the
      // unqueued upstream check to avoid re-entering `enqueueCommand`.
      try {
        if (await this._hasUpstreamInternal()) {
          await this.git.pull()
        }
      } catch {
        // Pull failed (network issue, etc.) — checkout still succeeded, so ignore
      }

      // Clear cache after branch switch
      this.clearCache()
    }))
  }

  async isCurrentBranchPublished(): Promise<boolean> {
    try {
      const upstream = await this.getUpstreamBranch()
      return upstream !== null
    } catch {
      // If there's an error checking upstream, assume unpublished
      return false
    }
  }

  /** Unqueued upstream-exists check. Safe to call from inside an existing
   * `enqueueCommand` scope without risking a nested-queue deadlock. */
  private async _hasUpstreamInternal(): Promise<boolean> {
    try {
      await this.git.revparse(['--abbrev-ref', '--symbolic-full-name', '@{u}'])
      return true
    } catch {
      return false
    }
  }

  /**
   * Force a fetch on the next getCommitsAheadBehind() call,
   * regardless of the auto-fetch toggle or throttle timer.
   */
  forceFetchOnce(): void {
    this._forceFetchNext = true
  }

  private async fetchIfStale(): Promise<void> {
    if (this._forceFetchNext) {
      this._forceFetchNext = false
      this._lastFetchTimestamp = Date.now()
      await this.enqueueCommand(() => this.git.raw(['fetch', '--quiet']))
      return
    }
    if (!this._autoFetchEnabled) return
    const now = Date.now()
    if (now - this._lastFetchTimestamp < this._fetchThrottleMs) return
    this._lastFetchTimestamp = now
    await this.enqueueCommand(() => this.git.raw(['fetch', '--quiet']))
  }

  async getCommitsAheadBehind(): Promise<{ ahead: number; behind: number }> {
    const zero = { ahead: 0, behind: 0 }
    try {
      const upstream = await this.getUpstreamBranch()
      if (!upstream) return zero

      // Fetch remote refs at most once per throttle interval (default 3min;
      // see setFetchConfig) so @{u} stays reasonably fresh.
      await this.fetchIfStale()

      return this.runSafe(zero, async () => {
        const aheadOut = await this.git.raw(['rev-list', '--count', '@{u}..HEAD'])
        const behindOut = await this.git.raw(['rev-list', '--count', 'HEAD..@{u}'])
        return {
          ahead: parseInt(aheadOut.trim() || '0', 10) || 0,
          behind: parseInt(behindOut.trim() || '0', 10) || 0,
        }
      })
    } catch (error) {
      console.error('getCommitsAheadBehind error:', error)
      return zero
    }
  }

  async pushBranch(branchName?: string): Promise<void> {
    return this.withWriteFlag(() => this.enqueueCommand(async () => {
      // Resolve current branch and upstream state via unqueued internals —
      // calling `getCurrentBranch` / `isCurrentBranchPublished` here would
      // re-enter `enqueueCommand` and deadlock the promise queue.
      const branch = branchName || (await this.git.revparse(['--abbrev-ref', 'HEAD'])).trim()
      const isPublished = await this._hasUpstreamInternal()

      try {
        if (isPublished) {
          await this.git.push()
        } else {
          await this.git.push('origin', branch, ['-u'])
        }
      } catch (err: any) {
        const msg = String(err?.message || '')
        if (msg.includes('Could not read from remote repository')) {
          throw new Error('Failed to push: Cannot connect to remote repository. Check your network connection and repository access.')
        } else if (msg.includes('remote: Permission')) {
          throw new Error('Failed to push: Permission denied. Check your repository access rights.')
        } else if (msg.includes('non-fast-forward')) {
          throw new Error('Failed to push: Remote branch has diverged. Pull changes first.')
        } else if (msg.includes('Everything up-to-date')) {
          throw new Error('Everything up-to-date. No commits to push.')
        } else {
          throw new Error(msg || 'Failed to push changes')
        }
      }

      // Clear cache and reset fetch timer (push updates remote refs)
      this.clearCache()
      this._lastFetchTimestamp = Date.now()
    }))
  }

  async pullBranch(): Promise<void> {
    return this.withWriteFlag(() => this.enqueueCommand(async () => {
      // Unqueued upstream check — see pushBranch for rationale.
      const hasUpstream = await this._hasUpstreamInternal()
      if (!hasUpstream) {
        throw new Error('No upstream branch to pull from. Push your branch first.')
      }

      try {
        await this.git.pull()
      } catch (err: any) {
        const msg = String(err?.message || '')
        if (msg.includes('Automatic merge failed')) {
          throw new Error('Failed to pull: Merge conflicts detected. Resolve conflicts and commit.')
        } else if (msg.includes('Your local changes')) {
          throw new Error('Failed to pull: You have uncommitted changes. Commit or stash them first.')
        } else if (msg.includes('Could not read from remote repository')) {
          throw new Error('Failed to pull: Cannot connect to remote repository. Check your network connection.')
        } else if (msg.includes('Permission denied')) {
          throw new Error('Failed to pull: Permission denied. Check your repository access rights.')
        } else if (msg.includes('Already up to date')) {
          // This is actually okay - no changes to pull
          return
        } else {
          throw new Error(msg || 'Failed to pull changes')
        }
      }

      // Clear cache and reset fetch timer (pull already fetched remote refs)
      this.clearCache()
      this._lastFetchTimestamp = Date.now()
    }))
  }

  // --- Stash operations ---

  async stashPush(message?: string, stagedOnly?: boolean): Promise<string> {
    const args = ['push']
    if (message) args.push('-m', message)
    args.push(stagedOnly ? '--staged' : '--include-untracked')

    return this.runWrite('Failed to stash changes', async () => {
      const output = await this.git.stash(args)
      this.clearCache()
      return output || 'Changes stashed'
    })
  }

  async stashList(): Promise<StashEntry[]> {
    // `runSafe` is too blunt here — we want to swallow ONLY the "empty stash
    // list" case (which git surfaces as "unknown revision") and surface every
    // other error so broken stash refs or corrupt repo state don't vanish
    // behind a silently-empty list.
    return this.enqueueCommand(async () => {
      try {
        // simple-git's stashList() returns a LogResult with typed entries
        // (hash/date/message/refs/body/author_*). Map to our StashEntry shape.
        const log = await this.git.stashList()
        return log.all.map((entry, i) => ({
          index: i,
          ref: `stash@{${i}}`,
          message: entry.message || '',
          date: entry.date || '',
        }))
      } catch (err: any) {
        const msg = String(err?.message || '')
        if (msg.includes('unknown revision')) return []
        throw new Error(msg || 'Failed to list stashes')
      }
    })
  }

  async stashApply(index: number): Promise<void> {
    return this.withWriteFlag(() => this.enqueueCommand(async () => {
      try {
        await this.git.stash(['apply', `stash@{${index}}`])
        this.clearCache()
      } catch (err: any) {
        const msg = String(err?.message || '')
        if (isStashConflictMessage(msg)) {
          // Partial success: stash was applied but left unmerged files.
          // Refresh cache so the UI sees them, then signal upward.
          this.clearCache()
          throw new StashConflictError(msg || 'Stash applied with conflicts')
        }
        throw new Error(msg || 'Failed to apply stash')
      }
    }))
  }

  async stashPop(index: number): Promise<void> {
    return this.withWriteFlag(() => this.enqueueCommand(async () => {
      try {
        await this.git.stash(['pop', `stash@{${index}}`])
        this.clearCache()
      } catch (err: any) {
        const msg = String(err?.message || '')
        if (isStashConflictMessage(msg)) {
          // Partial success (same as stashApply). Note: `git stash pop`
          // with conflicts leaves the stash entry in place.
          this.clearCache()
          throw new StashConflictError(msg || 'Stash popped with conflicts — stash retained')
        }
        throw new Error(msg || 'Failed to pop stash')
      }
    }))
  }

  async stashDrop(index: number): Promise<void> {
    await this.runWrite('Failed to drop stash', async () => {
      await this.git.stash(['drop', `stash@{${index}}`])
    })
  }

  async stashClear(): Promise<void> {
    await this.runWrite('Failed to clear stashes', async () => {
      await this.git.stash(['clear'])
    })
  }

  async getCommitsBetweenBranches(baseBranch: string, targetBranch = 'HEAD'): Promise<{ subject: string; body: string }[]> {
    return this.runSafe<{ subject: string; body: string }[]>([], async () => {
      // simple-git's log() returns DefaultLogFields with message/body. Pass
      // format via the typed `format` option so body is preserved verbatim.
      const log = await this.git.log({
        from: baseBranch,
        to: targetBranch,
        format: { subject: '%s', body: '%b' },
        '--reverse': null,
      } as any)
      return log.all
        .map((entry: any) => ({
          subject: String(entry.subject || '').trim(),
          body: String(entry.body || '').trim(),
        }))
        .filter(c => c.subject)
    })
  }
}