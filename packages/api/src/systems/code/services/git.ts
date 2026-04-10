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
  /** Serializes all git process invocations to prevent index.lock races. */
  private commandQueue: Promise<void> = Promise.resolve()
  private _writeInProgress = 0
  private _writeCompleteCallbacks: (() => void)[] = []
  private _lastFetchTimestamp = 0
  private _autoFetchEnabled = false
  private _fetchThrottleMs = 180_000
  /** simple-git instance. maxConcurrentProcesses:1 so it serializes
   * internally as a belt-and-suspenders alongside our enqueueCommand. */
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

  /** Run fn serially on the command queue. Every public method wraps its
   * body in this to prevent git index.lock races, even though simple-git's
   * maxConcurrentProcesses:1 already serializes within one instance. */
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

  private async isDirectory(filePath: string): Promise<boolean> {
    try {
      const fullPath = path.join(this.workingDirectory, filePath)
      const stats = await fs.stat(fullPath)
      return stats.isDirectory()
    } catch {
      return false
    }
  }

  private async getUntrackedFilesInDirectory(dirPath: string): Promise<GitStatusFile[]> {
    return this.enqueueCommand(async () => {
      try {
        const output = await this.git.raw(['ls-files', '--others', '--exclude-standard', dirPath])
        const files = output.trim().split('\n').filter(Boolean)
        return files.map(filePath => ({
          path: filePath,
          status: 'untracked' as const,
          staged: false,
        }))
      } catch {
        return []
      }
    })
  }
  
  // Invalidate specific cache entries when files change
  invalidateCache(paths?: string[]): void {
    if (!paths || paths.length === 0) {
      // Clear everything if no specific paths
      this.clearCache()
      return
    }
    
    // Always invalidate status when any file changes
    this.cache.delete('status')
    
    // If .git files changed, invalidate branch-related caches
    if (paths.some(p => p.includes('.git'))) {
      this.cache.delete('baseBranch')
      this.cache.delete('prBaseBranch')
      this.cache.delete('gitRepoValidated')
    }
    
    // Invalidate binary file cache for changed files
    paths.forEach(path => {
      this.cache.delete(`binary:${path}`)
    })
  }

  async getCurrentBranch(): Promise<string> {
    return this.enqueueCommand(async () => {
      try {
        const output = await this.git.revparse(['--abbrev-ref', 'HEAD'])
        return output.trim()
      } catch (err: any) {
        throw new Error(err?.message || 'Failed to get current branch')
      }
    })
  }

  async getStatus(): Promise<GitStatusFile[]> {
    const cached = this.getCached<GitStatusFile[]>('status')
    if (cached) return cached

    return this.enqueueCommand(async () => {
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
          const dirFiles = await this.getUntrackedFilesInDirectory(file.path)
          expandedFiles.push(...dirFiles)
        } else {
          expandedFiles.push(file)
        }
      }

      this.setCached('status', expandedFiles)
      return expandedFiles
    })
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
    // For untracked files, we need to show the file content as an addition
    if (filePath) {
      const status = await this.getStatus()
      const fileStatus = status.find(f => f.path === filePath && f.staged === staged)
      
      if (fileStatus?.status === 'untracked') {
        const fullPath = path.join(this.workingDirectory, filePath)
        
        // Check if it's a directory
        if (await this.isDirectory(filePath)) {
          // Return a synthetic diff for directories
          let diff = `diff --git a/${filePath} b/${filePath}\n`
          diff += `new directory\n`
          diff += `Unable to show diff for directory\n`
          return diff
        }
        
        // Check if file is binary
        if (await this.isBinaryFile(fullPath)) {
          // Return a synthetic diff for binary files
          const relativePath = path.relative(this.workingDirectory, fullPath)
          let diff = `diff --git a/${relativePath} b/${relativePath}\n`
          diff += `new file mode 100644\n`
          diff += `index 0000000..0000000\n`
          diff += `Binary files /dev/null and b/${relativePath} differ\n`
          return diff
        }
        
        // Read the file content and format it as a diff
        try {
          const content = await fs.readFile(fullPath, 'utf8')
          const lines = content.split(/\r?\n/) // Handle CRLF
          
          // Format as a git diff for a new file
          const relativePath = path.relative(this.workingDirectory, fullPath)
          let diff = `diff --git a/${relativePath} b/${relativePath}\n`
          diff += `new file mode 100644\n`
          diff += `index 0000000..0000000\n`
          diff += `--- /dev/null\n`
          diff += `+++ b/${relativePath}\n`
          diff += `@@ -0,0 +1,${lines.length} @@\n`
          diff += lines.map(line => `+${line}`).join('\n')
          
          return diff
        } catch (error) {
          throw new Error(`Failed to read untracked file: ${error}`)
        }
      }
    }
    
    const args: string[] = ['--binary', '-M']
    if (staged) {
      args.push('--cached')
    }
    if (filePath) {
      args.push('--', filePath)
    }

    return this.enqueueCommand(async () => {
      try {
        return await this.git.diff(args)
      } catch (err: any) {
        throw new Error(err?.message || 'Failed to get diff')
      }
    })
  }

  async getFileContent(filePath: string, version: 'HEAD' | 'working' | 'index' = 'working'): Promise<string> {
    if (version === 'working') {
      // Working-tree reads don't touch the git index — no queue needed
      try {
        const relativePath = filePath.startsWith(this.workingDirectory)
          ? filePath.slice(this.workingDirectory.length + 1)
          : filePath

        if (await this.isDirectory(relativePath)) {
          return ''
        }

        const fullPath = path.join(this.workingDirectory, relativePath)
        return await fs.readFile(fullPath, 'utf8')
      } catch (error) {
        throw new Error(`Failed to read file: ${error}`)
      }
    } else {
      const relativePath = filePath.startsWith(this.workingDirectory)
        ? filePath.slice(this.workingDirectory.length + 1)
        : filePath
      const ref = version === 'HEAD' ? `HEAD:${relativePath}` : `:${relativePath}`
      return this.enqueueCommand(async () => {
        try {
          return await this.git.show([ref])
        } catch {
          return ''
        }
      })
    }
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

    const relativePath = filePath.startsWith(this.workingDirectory)
      ? filePath.slice(this.workingDirectory.length + 1)
      : filePath

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
      const ref = filePath.includes(':') || filePath.startsWith('-')
        ? `${branch}:./${filePath}`
        : `${branch}:${filePath}`
      const buffer = await this.executeGitCommandBinary(['show', ref])
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
    return this.withWriteFlag(() => this.enqueueCommand(async () => {
      try {
        await this.git.add(filePaths)
        this.cache.delete('status')
      } catch (err: any) {
        throw new Error(err?.message || 'Failed to stage files')
      }
    }))
  }

  async unstageFiles(filePaths: string[]): Promise<void> {
    if (filePaths.length === 0) return
    return this.withWriteFlag(() => this.enqueueCommand(async () => {
      try {
        await this.git.reset(['HEAD', ...filePaths])
        this.cache.delete('status')
      } catch (err: any) {
        throw new Error(err?.message || 'Failed to unstage files')
      }
    }))
  }

  async revertFile(filePath: string): Promise<void> {
    return this.withWriteFlag(() => this.enqueueCommand(async () => {
      const status = await this.getStatus()
      const fileStatus = status.find(f => f.path === filePath)

      if (fileStatus?.status === 'untracked') {
        const fullPath = path.join(this.workingDirectory, filePath)
        await fs.unlink(fullPath)
      } else if (fileStatus?.status === 'unmerged') {
        // `git checkout --` refuses unmerged paths; explicit HEAD ref works
        // and clears the conflict state in both the index and worktree.
        try {
          await this.git.checkout(['HEAD', '--', filePath])
        } catch (err: any) {
          throw new Error(err?.message || `Failed to revert file: ${filePath}`)
        }
      } else {
        try {
          await this.git.checkout(['--', filePath])
        } catch (err: any) {
          throw new Error(err?.message || `Failed to revert file: ${filePath}`)
        }
      }
      this.cache.delete('status')
    }))
  }

  async revertFiles(filePaths: string[]): Promise<void> {
    if (filePaths.length === 0) return
    return this.withWriteFlag(() => this.enqueueCommand(async () => {
      const status = await this.getStatus()
      const statusMap = new Map(status.map(f => [f.path, f.status]))

      const untrackedPaths = filePaths.filter(p => statusMap.get(p) === 'untracked')
      const unmergedPaths = filePaths.filter(p => statusMap.get(p) === 'unmerged')
      const trackedPaths = filePaths.filter(p => {
        const s = statusMap.get(p)
        return s !== 'untracked' && s !== 'unmerged'
      })

      // Delete untracked files
      for (const filePath of untrackedPaths) {
        const fullPath = path.join(this.workingDirectory, filePath)
        await fs.unlink(fullPath)
      }

      // Revert unmerged files via explicit HEAD ref (plain `checkout --` errors)
      if (unmergedPaths.length > 0) {
        try {
          await this.git.checkout(['HEAD', '--', ...unmergedPaths])
        } catch (err: any) {
          throw new Error(err?.message || 'Failed to revert unmerged files')
        }
      }

      // Revert tracked files
      if (trackedPaths.length > 0) {
        try {
          await this.git.checkout(['--', ...trackedPaths])
        } catch (err: any) {
          throw new Error(err?.message || 'Failed to revert files')
        }
      }

      this.cache.delete('status')
    }))
  }

  async commit(message: string): Promise<void> {
    if (!message.trim()) {
      throw new Error('Commit message cannot be empty')
    }
    return this.withWriteFlag(() => this.enqueueCommand(async () => {
      try {
        await this.git.commit(message)
      } catch (err: any) {
        throw new Error(err?.message || 'Failed to commit')
      }
    }))
  }

  async isGitRepository(): Promise<boolean> {
    return this.enqueueCommand(async () => {
      try {
        return await this.git.checkIsRepo()
      } catch {
        return false
      }
    })
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
    return this.enqueueCommand(async () => {
      try {
        const output = await this.git.raw(['rev-list', '--count', `${branch}..HEAD`])
        const n = parseInt(output.trim(), 10)
        return Number.isFinite(n) ? n : Infinity
      } catch {
        return Infinity
      }
    })
  }

  private async getNearbyMergedBranches(depth: number): Promise<string[]> {
    return this.enqueueCommand(async () => {
      try {
        const output = await this.git.raw([
          'branch', '--merged', 'HEAD', '--contains', `HEAD~${depth}`, '--format=%(refname:short)',
        ])
        return output.trim().split('\n').filter(Boolean)
      } catch {
        // Falls back to all merged branches if HEAD~N is invalid (e.g., repo has < N commits)
        try {
          const fallback = await this.git.raw([
            'branch', '--merged', 'HEAD', '--format=%(refname:short)',
          ])
          return fallback.trim().split('\n').filter(Boolean)
        } catch {
          return []
        }
      }
    })
  }

  async getBranchDiff(baseBranch: string, targetBranch?: string): Promise<GitStatusFile[]> {
    const target = targetBranch || 'HEAD'

    return this.enqueueCommand(async () => {
      let output: string
      try {
        // NUL-separated, with rename/copy detection. Pass through `.raw()`
        // because simple-git's diff helpers don't surface the -z form we need.
        output = await this.git.raw(['diff', '--name-status', '-z', '-M', '-C', `${baseBranch}...${target}`])
      } catch (err: any) {
        throw new Error(err?.message || 'Failed to get branch diff')
      }

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

    // Validate branch names to prevent injection
    if (!/^[a-zA-Z0-9._/-]+$/.test(baseBranch) || !/^[a-zA-Z0-9._/-]+$/.test(target)) {
      throw new Error('Invalid branch name')
    }

    return this.enqueueCommand(async () => {
      try {
        return await this.git.raw(['diff', '--binary', '-M', `${baseBranch}...${target}`, '--', filePath])
      } catch (err: any) {
        // `git diff` exits 1 when there are differences — but simple-git only
        // throws on actual errors, so a thrown error here is a real failure.
        throw new Error(err?.message || 'Failed to get file diff between branches')
      }
    })
  }

  async getFileContentFromBranch(filePath: string, branch: string): Promise<string> {
    // For files with special characters (colons, leading dash), use rev:./path
    // syntax which is safer.
    const ref = (filePath.includes(':') || filePath.startsWith('-'))
      ? `${branch}:./${filePath}`
      : `${branch}:${filePath}`

    return this.enqueueCommand(async () => {
      try {
        return await this.git.show([ref])
      } catch {
        // File might not exist in that branch — not an error.
        return ''
      }
    })
  }

  async fetchRemoteBranch(branch: string): Promise<void> {
    return this.withWriteFlag(() => this.enqueueCommand(async () => {
      try {
        await this.git.fetch('origin', branch)
      } catch { /* best-effort fetch, swallow errors to preserve old behavior */ }
    }))
  }

  async deleteRemoteBranch(branch: string): Promise<void> {
    return this.withWriteFlag(() => this.enqueueCommand(async () => {
      try {
        await this.git.push('origin', branch, ['--delete'])
      } catch (err: any) {
        throw new Error(err?.message || 'Failed to delete remote branch')
      }
    }))
  }

  async getAllBranches(): Promise<string[]> {
    return this.enqueueCommand(async () => {
      try {
        // simple-git's branch() parses into a BranchSummary with typed `all`
        // and `branches`. Sort-by-committerdate has to be specified via args.
        const summary = await this.git.branch(['-a', '--no-color', '--sort=-committerdate'])
        const seen = new Set<string>()
        const result: string[] = []
        for (const raw of summary.all) {
          // Skip HEAD pointer entries.
          if (raw.includes('HEAD ->')) continue
          // Strip remotes/origin/ prefix.
          const name = raw.startsWith('remotes/origin/')
            ? raw.slice('remotes/origin/'.length)
            : raw
          if (!name || seen.has(name)) continue
          seen.add(name)
          result.push(name)
        }
        return result
      } catch (err: any) {
        throw new Error(err?.message || 'Failed to get branches')
      }
    })
  }

  async checkoutBranch(branchName: string): Promise<void> {
    if (!branchName.trim()) {
      throw new Error('Branch name cannot be empty')
    }
    
    // Validate branch name to prevent command injection
    if (!/^[a-zA-Z0-9._\/-]+$/.test(branchName)) {
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

      // After successful checkout, pull latest (best-effort)
      try {
        const hasUpstream = await this.isCurrentBranchPublished()
        if (hasUpstream) {
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

  private _forceFetchNext = false

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
    try {
      // Check if we have an upstream branch
      const upstream = await this.getUpstreamBranch()
      if (!upstream) {
        return { ahead: 0, behind: 0 }
      }

      // Fetch remote refs at most once per minute so @{u} stays reasonably fresh
      await this.fetchIfStale()

      return this.enqueueCommand(async () => {
        try {
          const aheadOut = await this.git.raw(['rev-list', '--count', '@{u}..HEAD'])
          const behindOut = await this.git.raw(['rev-list', '--count', 'HEAD..@{u}'])
          return {
            ahead: parseInt(aheadOut.trim() || '0', 10) || 0,
            behind: parseInt(behindOut.trim() || '0', 10) || 0,
          }
        } catch {
          return { ahead: 0, behind: 0 }
        }
      })
    } catch (error) {
      // Log the error for debugging
      console.error('getCommitsAheadBehind error:', error)
      // If there's an error, return zeros
      return { ahead: 0, behind: 0 }
    }
  }

  async pushBranch(branchName?: string): Promise<void> {
    return this.withWriteFlag(() => this.enqueueCommand(async () => {
      // Get current branch if not specified
      const branch = branchName || await this.getCurrentBranch()

      // Check if branch is published
      const isPublished = await this.isCurrentBranchPublished()

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
      // Check if we have an upstream branch
      const hasUpstream = await this.isCurrentBranchPublished()
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
    return this.withWriteFlag(() => this.enqueueCommand(async () => {
      const args = ['push']
      if (message) {
        args.push('-m', message)
      }
      if (stagedOnly) {
        args.push('--staged')
      } else {
        args.push('--include-untracked')
      }
      try {
        const output = await this.git.stash(args)
        this.clearCache()
        return output || 'Changes stashed'
      } catch (err: any) {
        throw new Error(err?.message || 'Failed to stash changes')
      }
    }))
  }

  async stashList(): Promise<StashEntry[]> {
    return this.enqueueCommand(async () => {
      try {
        // simple-git's stashList() returns a LogResult typed as
        // { all: DefaultLogFields[], latest, total }. Each entry has
        // hash/date/message/refs/body/author_*. We derive our own format.
        const log = await this.git.stashList()
        return log.all.map((entry, i) => ({
          index: i,
          ref: `stash@{${i}}`,
          message: entry.message || '',
          date: entry.date || '',
        }))
      } catch (err: any) {
        // Empty stash list is not an error
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
          // Stash was applied — unmerged files now exist. Refresh cache so
          // the UI picks them up, then signal the conflict upward.
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
          // `git stash pop` with conflicts leaves the stash in place and
          // still applies unmerged files — refresh cache and signal conflict.
          this.clearCache()
          throw new StashConflictError(msg || 'Stash popped with conflicts — stash retained')
        }
        throw new Error(msg || 'Failed to pop stash')
      }
    }))
  }

  async stashDrop(index: number): Promise<void> {
    return this.withWriteFlag(() => this.enqueueCommand(async () => {
      try {
        await this.git.stash(['drop', `stash@{${index}}`])
      } catch (err: any) {
        throw new Error(err?.message || 'Failed to drop stash')
      }
    }))
  }

  async stashClear(): Promise<void> {
    return this.withWriteFlag(() => this.enqueueCommand(async () => {
      try {
        await this.git.stash(['clear'])
      } catch (err: any) {
        throw new Error(err?.message || 'Failed to clear stashes')
      }
    }))
  }

  async getCommitsBetweenBranches(baseBranch: string, targetBranch = 'HEAD'): Promise<{ subject: string; body: string }[]> {
    return this.enqueueCommand(async () => {
      try {
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
      } catch {
        return []
      }
    })
  }
}