import { execFile } from 'child_process'
import { promisify } from 'util'
import * as path from 'path'
import * as fs from 'fs/promises'
import { GitStatusFile, StashEntry } from '../types'

const execFileAsync = promisify(execFile)

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

interface GitCommandResult {
  success: boolean
  output?: string
  error?: string
}

interface GitCommandError extends Error {
  code?: number | string
  stdout?: string
  stderr?: string
}

interface CachedResult<T> {
  data: T
  timestamp: number
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

  constructor(private workingDirectory: string) {
    this.validateWorkingDirectory(workingDirectory)
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

  /** Run fn serially on the command queue (used by executeGitCommand). */
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
    // We'll validate .git existence asynchronously on first command
  }
  
  private async ensureGitRepository(): Promise<void> {
    const cacheKey = 'gitRepoValidated'
    if (this.getCached<boolean>(cacheKey)) return
    
    try {
      await fs.access(path.join(this.workingDirectory, '.git'))
      this.setCached(cacheKey, true)
    } catch {
      throw new Error(`Not a git repository: ${this.workingDirectory}`)
    }
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
    try {
      // Use git ls-files to get untracked files in the directory
      const result = await this.executeGitCommand([
        'ls-files', 
        '--others', 
        '--exclude-standard',
        dirPath
      ])
      
      if (!result.success || !result.output) {
        return []
      }
      
      const files = result.output.trim().split('\n').filter(Boolean)
      return files.map(filePath => ({
        path: filePath,
        status: 'untracked' as const,
        staged: false
      }))
    } catch {
      return []
    }
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

  private executeGitCommand(args: string[]): Promise<GitCommandResult> {
    return this.enqueueCommand(async () => {
      // Always add --color=never to prevent ANSI codes
      const colorlessArgs = ['-c', 'color.ui=never', ...args]

      try {
        const { stdout } = await execFileAsync('git', colorlessArgs, {
          cwd: this.workingDirectory,
          env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
          maxBuffer: 10 * 1024 * 1024, // 10MB buffer limit
          encoding: 'utf8'
        })

        return { success: true, output: stdout }
      } catch (error) {
        const gitError = error as GitCommandError

        // Special cases where non-zero exit codes are expected
        if (gitError.code === 1 && args[0] === 'diff') {
          return { success: true, output: gitError.stdout || '' }
        }
        if (gitError.code === 128 && args[0] === 'show') {
          return { success: true, output: '' }
        }

        return {
          success: false,
          error: gitError.stderr || gitError.message,
          output: gitError.stdout
        }
      }
    })
  }

  async getCurrentBranch(): Promise<string> {
    const result = await this.executeGitCommand(['rev-parse', '--abbrev-ref', 'HEAD'])
    if (result.success && result.output) {
      return result.output.trim()
    }
    throw new Error(result.error || 'Failed to get current branch')
  }

  async getStatus(): Promise<GitStatusFile[]> {
    // Check cache first
    const cached = this.getCached<GitStatusFile[]>('status')
    if (cached) return cached

    const result = await this.executeGitCommand(['status', '--porcelain', '-z'])
    if (!result.success) {
      throw new Error(result.error || 'Failed to get git status')
    }
    
    const files: GitStatusFile[] = []
    const entries = (result.output || '').split('\0').filter(Boolean)
    
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]
      if (entry.length < 3) continue
      
      const indexStatus = entry[0]
      const workingStatus = entry[1]
      const rest = entry.substring(3)
      
      // Handle renames - with -z flag, git status uses NUL-separated format
      // For renames: XY newpath\0oldpath (the XY line contains the new path,
      // and the entry after NUL is the original/old path per git docs)
      let fileName: string = rest
      let originalPath: string | undefined

      // Handle staged files
      if (indexStatus !== ' ' && indexStatus !== '?') {
        // For renames/copies in staged files, we need to handle the two-path format
        if (indexStatus.startsWith('R') || indexStatus.startsWith('C')) {
          // Next entry is the old/original path; fileName already has the new path
          if (i + 1 < entries.length) {
            originalPath = entries[++i]
          }
        }
        
        files.push({
          path: fileName,
          status: this.mapGitStatus(indexStatus),
          staged: true,
          originalPath: originalPath
        })
      }
      
      // Handle unstaged files
      if (workingStatus !== ' ') {
        // For renames/copies in working tree, handle two-path format
        if (workingStatus.startsWith('R') || workingStatus.startsWith('C')) {
          // For unstaged renames, we might need to consume the next path
          // However, git status --porcelain doesn't show unstaged renames with two paths
          // It shows them as deleted + untracked, so this is mainly for consistency
        }
        
        files.push({
          path: fileName,
          status: this.mapGitStatus(workingStatus),
          staged: false,
          originalPath: undefined // Unstaged renames appear as D + ?
        })
      }
      
      // Handle untracked files - don't duplicate them
      if (indexStatus === '?' && workingStatus === '?') {
        // Only add if not already added
        if (!files.some(f => f.path === fileName)) {
          files.push({
            path: fileName,
            status: 'untracked',
            staged: false
          })
        }
      }
    }
    
    // Expand directories to show individual files
    const expandedFiles: GitStatusFile[] = []
    for (const file of files) {
      if (await this.isDirectory(file.path)) {
        // If it's a directory, get all untracked files inside it
        const dirFiles = await this.getUntrackedFilesInDirectory(file.path)
        expandedFiles.push(...dirFiles)
      } else {
        expandedFiles.push(file)
      }
    }
    
    // Cache the result
    this.setCached('status', expandedFiles)
    return expandedFiles
  }

  private mapGitStatus(status: string): GitStatusFile['status'] {
    // Extract the status letter from codes like R100, C85, M, etc.
    const statusLetter = status.charAt(0)
    
    switch (statusLetter) {
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

  private async isBinaryFile(filePath: string): Promise<boolean> {
    // Check cache first
    const cacheKey = `binary:${filePath}`
    const cached = this.getCached<boolean>(cacheKey)
    if (cached !== null) return cached
    
    // First, try git's built-in binary detection
    const gitResult = await this.executeGitCommand(['check-attr', 'diff', '--', filePath])
    if (gitResult.success && gitResult.output) {
      // Git attributes format: "path: diff: value"
      const isBinary = gitResult.output.includes(': diff: binary') || 
                      gitResult.output.includes(': diff: -diff')
      if (isBinary) {
        this.setCached(cacheKey, true)
        return true
      }
    }
    
    // If git doesn't say it's binary, check if it's text according to git
    const diffStatResult = await this.executeGitCommand(['diff', '--numstat', '/dev/null', filePath])
    if (diffStatResult.success && diffStatResult.output) {
      // Binary files show as "-\t-\tfilename" in numstat
      if (diffStatResult.output.startsWith('-\t-\t')) {
        this.setCached(cacheKey, true)
        return true
      }
    }
    
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
    
    const args = ['diff', '--binary', '-M']
    if (staged) {
      args.push('--cached')
    }
    if (filePath) {
      args.push('--', filePath)
    }
    
    const result = await this.executeGitCommand(args)
    if (!result.success) {
      throw new Error(result.error || 'Failed to get diff')
    }
    
    return result.output || ''
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
      const result = await this.executeGitCommand(['show', ref])
      if (!result.success) {
        return ''
      }
      return result.output || ''
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
    return this.withWriteFlag(async () => {
      const result = await this.executeGitCommand(['add', ...filePaths])
      if (!result.success) {
        throw new Error(result.error || 'Failed to stage files')
      }
      this.cache.delete('status')
    })
  }

  async unstageFiles(filePaths: string[]): Promise<void> {
    if (filePaths.length === 0) return
    return this.withWriteFlag(async () => {
      const result = await this.executeGitCommand(['reset', 'HEAD', ...filePaths])
      if (!result.success) {
        throw new Error(result.error || 'Failed to unstage files')
      }
      this.cache.delete('status')
    })
  }

  async revertFile(filePath: string): Promise<void> {
    return this.withWriteFlag(async () => {
      const status = await this.getStatus()
      const fileStatus = status.find(f => f.path === filePath)

      if (fileStatus?.status === 'untracked') {
        const fullPath = path.join(this.workingDirectory, filePath)
        await fs.unlink(fullPath)
      } else {
        const result = await this.executeGitCommand(['checkout', '--', filePath])
        if (!result.success) {
          throw new Error(result.error || `Failed to revert file: ${filePath}`)
        }
      }
      this.cache.delete('status')
    })
  }

  async revertFiles(filePaths: string[]): Promise<void> {
    if (filePaths.length === 0) return
    return this.withWriteFlag(async () => {
      const status = await this.getStatus()
      const statusMap = new Map(status.map(f => [f.path, f.status]))

      const untrackedPaths = filePaths.filter(p => statusMap.get(p) === 'untracked')
      const trackedPaths = filePaths.filter(p => statusMap.get(p) !== 'untracked')

      // Delete untracked files
      for (const filePath of untrackedPaths) {
        const fullPath = path.join(this.workingDirectory, filePath)
        await fs.unlink(fullPath)
      }

      // Revert tracked files
      if (trackedPaths.length > 0) {
        const result = await this.executeGitCommand(['checkout', '--', ...trackedPaths])
        if (!result.success) {
          throw new Error(result.error || 'Failed to revert files')
        }
      }

      this.cache.delete('status')
    })
  }

  async commit(message: string): Promise<void> {
    if (!message.trim()) {
      throw new Error('Commit message cannot be empty')
    }
    return this.withWriteFlag(async () => {
      const result = await this.executeGitCommand(['commit', '-m', message])
      if (!result.success) {
        throw new Error(result.error || 'Failed to commit')
      }
    })
  }

  async isGitRepository(): Promise<boolean> {
    const result = await this.executeGitCommand(['rev-parse', '--git-dir'])
    return result.success
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
    const result = await this.executeGitCommand(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'])

    if (!result.success) {
      if (result.error?.includes('no upstream configured') ||
          result.error?.includes('@{u}') ||
          result.error?.includes('HEAD has no upstream')) {
        return null
      }
      throw new Error(`Failed to get upstream branch: ${result.error}`)
    }

    if (result.output) {
      const upstream = result.output.trim()
      const parts = upstream.split('/')
      if (parts.length >= 2) {
        return parts.slice(1).join('/')
      }
    }
    return null
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

    const originHeadResult = await this.executeGitCommand(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])
    if (originHeadResult.success && originHeadResult.output) {
      const branch = originHeadResult.output.trim().replace(/^origin\//, '')
      if (branch) {
        this.setCached(cacheKey, branch)
        return branch
      }
    }

    for (const branch of ['main', 'master', 'develop', 'development']) {
      const result = await this.executeGitCommand(['rev-parse', '--verify', branch])
      if (result.success) {
        this.setCached(cacheKey, branch)
        return branch
      }
    }

    throw new Error('Could not determine base branch')
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
    const result = await this.executeGitCommand(['rev-list', '--count', `${branch}..HEAD`])
    if (!result.success || !result.output) return Infinity
    return parseInt(result.output.trim(), 10)
  }

  private async getNearbyMergedBranches(depth: number): Promise<string[]> {
    const result = await this.executeGitCommand([
      'branch', '--merged', 'HEAD', '--contains', `HEAD~${depth}`, '--format=%(refname:short)',
    ])
    if (!result.success || !result.output) {
      // Falls back to all merged branches if HEAD~N is invalid (e.g., repo has < N commits)
      const fallback = await this.executeGitCommand([
        'branch', '--merged', 'HEAD', '--format=%(refname:short)',
      ])
      if (!fallback.success || !fallback.output) return []
      return fallback.output.trim().split('\n').filter(Boolean)
    }
    return result.output.trim().split('\n').filter(Boolean)
  }

  async getBranchDiff(baseBranch: string, targetBranch?: string): Promise<GitStatusFile[]> {
    const target = targetBranch || 'HEAD'
    
    // Get the list of changed files between branches with NUL termination and rename detection
    const result = await this.executeGitCommand(['diff', '--name-status', '-z', '-M', '-C', `${baseBranch}...${target}`])
    if (!result.success) {
      throw new Error(result.error || 'Failed to get branch diff')
    }
    
    const files: GitStatusFile[] = []
    const parts = (result.output || '').split('\0').filter(Boolean)
    
    for (let i = 0; i < parts.length; ) {
      const statusPart = parts[i++]
      if (!statusPart || i >= parts.length) break
      
      // Status is just a letter (M, A, D, R, C, T, U)
      const status = this.mapGitStatus(statusPart)
      const path = parts[i++]
      
      if (!path) continue
      
      // For renames and copies, there's a second path
      if ((statusPart.startsWith('R') || statusPart.startsWith('C')) && i < parts.length && parts[i]) {
        const originalPath = path
        const newPath = parts[i++]
        files.push({
          path: newPath,
          status,
          staged: false,
          originalPath
        })
      } else {
        files.push({
          path,
          status,
          staged: false
        })
      }
    }
    
    return files
  }

  async getFileDiffBetweenBranches(filePath: string, baseBranch: string, targetBranch?: string): Promise<string> {
    const target = targetBranch || 'HEAD'
    
    // Validate branch names to prevent injection
    if (!/^[a-zA-Z0-9._/-]+$/.test(baseBranch) || !/^[a-zA-Z0-9._/-]+$/.test(target)) {
      throw new Error('Invalid branch name')
    }
    
    const result = await this.executeGitCommand(['diff', '--binary', '-M', `${baseBranch}...${target}`, '--', filePath])
    if (!result.success) {
      throw new Error(result.error || 'Failed to get file diff between branches')
    }
    
    return result.output || ''
  }

  async getFileContentFromBranch(filePath: string, branch: string): Promise<string> {
    // For files with special characters, we need to be careful
    // If the path contains colons or starts with -, we need special handling
    let result: GitCommandResult
    
    if (filePath.includes(':') || filePath.startsWith('-')) {
      // Use the rev:./path syntax which is safer for special characters
      result = await this.executeGitCommand(['show', `${branch}:./${filePath}`])
    } else {
      // Standard format for normal paths
      result = await this.executeGitCommand(['show', `${branch}:${filePath}`])
    }
    
    if (!result.success) {
      // File might not exist in that branch - this is not an error
      return ''
    }
    return result.output || ''
  }

  async fetchRemoteBranch(branch: string): Promise<void> {
    return this.withWriteFlag(async () => {
      await this.executeGitCommand(['fetch', 'origin', branch])
    })
  }

  async deleteRemoteBranch(branch: string): Promise<void> {
    return this.withWriteFlag(async () => {
      const result = await this.executeGitCommand(['push', 'origin', '--delete', branch])
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete remote branch')
      }
    })
  }

  async getAllBranches(): Promise<string[]> {
    // Get all local and remote branches
    const result = await this.executeGitCommand(['branch', '-a', '--no-color', '--sort=-committerdate'])
    if (!result.success) {
      throw new Error(result.error || 'Failed to get branches')
    }
    
    // Parse the output to extract branch names
    const branches = (result.output || '')
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        // Remove the current branch marker (*) and any leading/trailing whitespace
        line = line.trim().replace(/^\*\s*/, '')
        
        // Handle remote branches - remove "remotes/origin/" prefix
        if (line.startsWith('remotes/origin/')) {
          // Skip HEAD pointer
          if (line.includes('HEAD ->')) return null
          return line.replace('remotes/origin/', '')
        }
        
        return line
      })
      .filter((branch): branch is string => branch !== null)
      
    // Remove duplicates (local and remote branches with same name)
    return [...new Set(branches)]
  }

  async checkoutBranch(branchName: string): Promise<void> {
    if (!branchName.trim()) {
      throw new Error('Branch name cannot be empty')
    }
    
    // Validate branch name to prevent command injection
    if (!/^[a-zA-Z0-9._\/-]+$/.test(branchName)) {
      throw new Error('Invalid branch name. Branch names can only contain letters, numbers, dots, underscores, hyphens, and forward slashes.')
    }
    
    return this.withWriteFlag(async () => {
      // Try to checkout the branch
      const result = await this.executeGitCommand(['checkout', branchName])

      if (!result.success) {
        // Check if it's because the branch doesn't exist locally
        if (result.error?.includes('pathspec') && result.error?.includes('did not match')) {
          // Try to create a new branch tracking the remote
          const remoteResult = await this.executeGitCommand(['checkout', '-b', branchName, `origin/${branchName}`])
          if (!remoteResult.success) {
            // If that fails too, just create a new local branch
            const newBranchResult = await this.executeGitCommand(['checkout', '-b', branchName])
            if (!newBranchResult.success) {
              throw new Error(newBranchResult.error || `Failed to create branch: ${branchName}`)
            }
          }
        } else if (result.error?.includes('Your local changes to the following files would be overwritten')) {
          // Git is preventing checkout due to conflicts
          throw new Error('Cannot switch branches: Your uncommitted changes conflict with files in the target branch. Please commit, stash, or discard your changes first.')
        } else {
          throw new Error(result.error || `Failed to checkout branch: ${branchName}`)
        }
      }

      // Clear cache after branch switch
      this.clearCache()
    })
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
      await this.executeGitCommand(['fetch', '--quiet'])
      return
    }
    if (!this._autoFetchEnabled) return
    const now = Date.now()
    if (now - this._lastFetchTimestamp < this._fetchThrottleMs) return
    this._lastFetchTimestamp = now
    await this.executeGitCommand(['fetch', '--quiet'])
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

      // Count commits ahead
      const aheadResult = await this.executeGitCommand(['rev-list', '--count', '@{u}..HEAD'])
      const ahead = aheadResult.success ? parseInt(aheadResult.output?.trim() || '0', 10) : 0
      
      // Count commits behind
      const behindResult = await this.executeGitCommand(['rev-list', '--count', 'HEAD..@{u}'])
      const behind = behindResult.success ? parseInt(behindResult.output?.trim() || '0', 10) : 0
      
      return { ahead, behind }
    } catch (error) {
      // Log the error for debugging
      console.error('getCommitsAheadBehind error:', error)
      // If there's an error, return zeros
      return { ahead: 0, behind: 0 }
    }
  }

  async pushBranch(branchName?: string): Promise<void> {
    return this.withWriteFlag(async () => {
      // Get current branch if not specified
      const branch = branchName || await this.getCurrentBranch()

      // Check if branch is published
      const isPublished = await this.isCurrentBranchPublished()

      // Use appropriate push command
      const args = isPublished
        ? ['push'] // Regular push for already published branches
        : ['push', '-u', 'origin', branch] // Set upstream for new branches

      const result = await this.executeGitCommand(args)

      if (!result.success) {
        // Check for common errors
        if (result.error?.includes('Could not read from remote repository')) {
          throw new Error('Failed to push: Cannot connect to remote repository. Check your network connection and repository access.')
        } else if (result.error?.includes('remote: Permission')) {
          throw new Error('Failed to push: Permission denied. Check your repository access rights.')
        } else if (result.error?.includes('non-fast-forward')) {
          throw new Error('Failed to push: Remote branch has diverged. Pull changes first.')
        } else if (result.error?.includes('Everything up-to-date')) {
          throw new Error('Everything up-to-date. No commits to push.')
        } else {
          throw new Error(result.error || 'Failed to push changes')
        }
      }

      // Clear cache and reset fetch timer (push updates remote refs)
      this.clearCache()
      this._lastFetchTimestamp = Date.now()
    })
  }

  async pullBranch(): Promise<void> {
    return this.withWriteFlag(async () => {
      // Check if we have an upstream branch
      const hasUpstream = await this.isCurrentBranchPublished()
      if (!hasUpstream) {
        throw new Error('No upstream branch to pull from. Push your branch first.')
      }

      // Execute git pull
      const result = await this.executeGitCommand(['pull'])

      if (!result.success) {
        // Handle common pull errors
        if (result.error?.includes('Automatic merge failed')) {
          throw new Error('Failed to pull: Merge conflicts detected. Resolve conflicts and commit.')
        } else if (result.error?.includes('Your local changes')) {
          throw new Error('Failed to pull: You have uncommitted changes. Commit or stash them first.')
        } else if (result.error?.includes('Could not read from remote repository')) {
          throw new Error('Failed to pull: Cannot connect to remote repository. Check your network connection.')
        } else if (result.error?.includes('Permission denied')) {
          throw new Error('Failed to pull: Permission denied. Check your repository access rights.')
        } else if (result.error?.includes('Already up to date')) {
          // This is actually okay - no changes to pull
          return
        } else {
          throw new Error(result.error || 'Failed to pull changes')
        }
      }

      // Clear cache and reset fetch timer (pull already fetched remote refs)
      this.clearCache()
      this._lastFetchTimestamp = Date.now()
    })
  }

  // --- Stash operations ---

  async stashPush(message?: string, stagedOnly?: boolean): Promise<string> {
    return this.withWriteFlag(async () => {
      const args = ['stash', 'push']
      if (message) {
        args.push('-m', message)
      }
      if (stagedOnly) {
        args.push('--staged')
      } else {
        args.push('--include-untracked')
      }
      const result = await this.executeGitCommand(args)
      if (!result.success) {
        throw new Error(result.error || 'Failed to stash changes')
      }
      this.clearCache()
      return result.output || 'Changes stashed'
    })
  }

  async stashList(): Promise<StashEntry[]> {
    const result = await this.executeGitCommand(['stash', 'list', '--format=%gd|||%s|||%ai'])
    if (!result.success) {
      // Empty stash list is not an error
      if (result.error?.includes('unknown revision')) return []
      throw new Error(result.error || 'Failed to list stashes')
    }
    if (!result.output?.trim()) return []

    return result.output.trim().split('\n').map((line, i) => {
      const parts = line.split('|||')
      return {
        index: i,
        ref: parts[0] || `stash@{${i}}`,
        message: parts[1] || '',
        date: parts[2] || ''
      }
    })
  }

  async stashApply(index: number): Promise<void> {
    return this.withWriteFlag(async () => {
      const result = await this.executeGitCommand(['stash', 'apply', `stash@{${index}}`])
      if (!result.success) {
        throw new Error(result.error || 'Failed to apply stash')
      }
      this.clearCache()
    })
  }

  async stashPop(index: number): Promise<void> {
    return this.withWriteFlag(async () => {
      const result = await this.executeGitCommand(['stash', 'pop', `stash@{${index}}`])
      if (!result.success) {
        throw new Error(result.error || 'Failed to pop stash')
      }
      this.clearCache()
    })
  }

  async stashDrop(index: number): Promise<void> {
    return this.withWriteFlag(async () => {
      const result = await this.executeGitCommand(['stash', 'drop', `stash@{${index}}`])
      if (!result.success) {
        throw new Error(result.error || 'Failed to drop stash')
      }
    })
  }

  async stashClear(): Promise<void> {
    return this.withWriteFlag(async () => {
      const result = await this.executeGitCommand(['stash', 'clear'])
      if (!result.success) {
        throw new Error(result.error || 'Failed to clear stashes')
      }
    })
  }

  async getCommitsBetweenBranches(baseBranch: string, targetBranch = 'HEAD'): Promise<{ subject: string; body: string }[]> {
    const separator = '---COMMIT_SEP---'
    const result = await this.executeGitCommand([
      'log', `${baseBranch}..${targetBranch}`,
      `--format=%s${separator}%b${separator}`,
      '--reverse'
    ])
    if (!result.success || !result.output?.trim()) return []

    return result.output
      .split(separator + '\n')
      .filter(chunk => chunk.trim())
      .map(chunk => {
        const parts = chunk.split(separator)
        return {
          subject: (parts[0] || '').trim(),
          body: (parts[1] || '').trim()
        }
      })
      .filter(c => c.subject)
  }
}