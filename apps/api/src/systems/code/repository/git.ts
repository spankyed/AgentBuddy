import { execFile } from 'child_process'
import { promisify } from 'util'
import * as path from 'path'
import * as fs from 'fs/promises'
import { GitStatusFile } from '../types'

const execFileAsync = promisify(execFile)

interface GitCommandResult {
  success: boolean
  output?: string
  error?: string
}

interface CachedResult<T> {
  data: T
  timestamp: number
}

export class GitRepository {
  private cache = new Map<string, CachedResult<any>>()
  private readonly CACHE_TTL = 5000 // 5 seconds
  
  constructor(private workingDirectory: string) {
    this.validateWorkingDirectory(workingDirectory)
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

  private async executeGitCommand(args: string[]): Promise<GitCommandResult> {
    // Always add --color=never to prevent ANSI codes
    const colorlessArgs = ['-c', 'color.ui=never', ...args]
    
    try {
      const { stdout, stderr } = await execFileAsync('git', colorlessArgs, {
        cwd: this.workingDirectory,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer limit
        encoding: 'utf8'
      })
      
      return { success: true, output: stdout }
    } catch (error: any) {
      // Special cases where non-zero exit codes are expected
      if (error.code === 1 && args[0] === 'diff') {
        // git diff returns 1 when there are differences
        return { success: true, output: error.stdout || '' }
      }
      if (error.code === 128 && args[0] === 'show') {
        // git show returns 128 when object doesn't exist (file not in branch)
        return { success: true, output: '' }
      }
      
      // Include original error for better debugging
      return { 
        success: false, 
        error: error.stderr || error.message,
        output: error.stdout // Sometimes useful for debugging
      }
    }
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
      // For renames: RXY oldpath\0newpath where X/Y are similarity scores
      let fileName: string = rest
      let originalPath: string | undefined
      
      // Handle staged files
      if (indexStatus !== ' ' && indexStatus !== '?') {
        // For renames/copies in staged files, we need to handle the two-path format
        if (indexStatus.startsWith('R') || indexStatus.startsWith('C')) {
          // Next entry should be the new path
          if (i + 1 < entries.length) {
            originalPath = fileName
            fileName = entries[++i]
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
    
    // Cache the result
    this.setCached('status', files)
    return files
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
    try {
      const stats = await fs.stat(filePath)
      // Large files are likely binary
      if (stats.size > 1024 * 1024) return true // > 1MB
      
      // Read first 8KB to check for binary content
      const buffer = Buffer.alloc(8192)
      const fd = await fs.open(filePath, 'r')
      try {
        const { bytesRead } = await fd.read(buffer, 0, 8192, 0)
        
        // Check for null bytes (common in binary files)
        for (let i = 0; i < bytesRead; i++) {
          if (buffer[i] === 0) return true
        }
        
        // Check for high ratio of non-printable characters
        let nonPrintable = 0
        for (let i = 0; i < bytesRead; i++) {
          const byte = buffer[i]
          if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
            nonPrintable++
          }
        }
        
        return nonPrintable / bytesRead > 0.3
      } finally {
        await fd.close()
      }
    } catch {
      return false
    }
  }

  async getDiff(filePath?: string, staged: boolean = false): Promise<string> {
    // For untracked files, we need to show the file content as an addition
    if (filePath) {
      const status = await this.getStatus()
      const fileStatus = status.find(f => f.path === filePath)
      
      if (fileStatus?.status === 'untracked') {
        const fullPath = path.join(this.workingDirectory, filePath)
        
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
    
    const args = ['diff', '--binary']
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

  async getFileContent(filePath: string, version: 'HEAD' | 'working' = 'working'): Promise<string> {
    if (version === 'working') {
      // Get current working file content
      try {
        // Ensure the file path is relative to the working directory
        const relativePath = filePath.startsWith(this.workingDirectory) 
          ? filePath.slice(this.workingDirectory.length + 1)
          : filePath
        const fullPath = path.join(this.workingDirectory, relativePath)
        return await fs.readFile(fullPath, 'utf8')
      } catch (error) {
        throw new Error(`Failed to read file: ${error}`)
      }
    } else {
      // Get file content from HEAD
      const relativePath = filePath.startsWith(this.workingDirectory) 
        ? filePath.slice(this.workingDirectory.length + 1)
        : filePath
      const result = await this.executeGitCommand(['show', `HEAD:${relativePath}`])
      if (!result.success) {
        // File might be new (not in HEAD)
        return ''
      }
      return result.output || ''
    }
  }

  async stageFiles(filePaths: string[]): Promise<void> {
    if (filePaths.length === 0) return
    
    const result = await this.executeGitCommand(['add', ...filePaths])
    if (!result.success) {
      throw new Error(result.error || 'Failed to stage files')
    }
  }

  async unstageFiles(filePaths: string[]): Promise<void> {
    if (filePaths.length === 0) return
    
    const result = await this.executeGitCommand(['reset', 'HEAD', ...filePaths])
    if (!result.success) {
      throw new Error(result.error || 'Failed to unstage files')
    }
  }

  async commit(message: string): Promise<void> {
    if (!message.trim()) {
      throw new Error('Commit message cannot be empty')
    }
    
    const result = await this.executeGitCommand(['commit', '-m', message])
    if (!result.success) {
      throw new Error(result.error || 'Failed to commit')
    }
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
    // Get the upstream branch of HEAD
    const result = await this.executeGitCommand(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'])
    if (result.success && result.output) {
      const upstream = result.output.trim()
      // Extract branch name from remote/branch format
      const parts = upstream.split('/')
      if (parts.length >= 2) {
        return parts.slice(1).join('/')
      }
    }
    return null
  }

  async getBaseBranch(options?: { preferUpstream?: boolean }): Promise<string> {
    const preferUpstream = options?.preferUpstream !== false // Default to true
    
    // Check cache first (different cache keys for different modes)
    const cacheKey = preferUpstream ? 'baseBranch' : 'prBaseBranch'
    const cached = this.getCached<string>(cacheKey)
    if (cached) return cached
    
    // 1. Try upstream of HEAD first (if preferred)
    if (preferUpstream) {
      const upstream = await this.getUpstreamBranch()
      if (upstream) {
        this.setCached(cacheKey, upstream)
        return upstream
      }
    }
    
    // 2. Try symbolic ref for origin/HEAD
    const originHeadResult = await this.executeGitCommand(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])
    if (originHeadResult.success && originHeadResult.output) {
      const branch = originHeadResult.output.trim().replace(/^origin\//, '')
      if (branch) {
        this.setCached(cacheKey, branch)
        return branch
      }
    }
    
    // 3. Probe for common branch names
    const checkBranch = async (branch: string): Promise<boolean> => {
      const result = await this.executeGitCommand(['rev-parse', '--verify', branch])
      return result.success
    }
    
    for (const branch of ['main', 'master', 'develop', 'development']) {
      if (await checkBranch(branch)) {
        this.setCached(cacheKey, branch)
        return branch
      }
    }
    
    throw new Error(`Could not determine ${preferUpstream ? 'base' : 'PR base'} branch`)
  }

  async getPRBaseBranch(): Promise<string> {
    return this.getBaseBranch({ preferUpstream: false })
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
    // Use -- separator for safety
    const result = await this.executeGitCommand(['show', `${branch}:${filePath}`])
    if (!result.success) {
      // File might not exist in that branch - this is not an error
      return ''
    }
    return result.output || ''
  }
}