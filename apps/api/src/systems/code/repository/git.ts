import { spawn } from 'child_process'
import * as path from 'path'
import * as fs from 'fs/promises'
import { GitStatusFile } from '../types'

interface GitCommandResult {
  success: boolean
  output?: string
  error?: string
}

export class GitRepository {
  constructor(private workingDirectory: string) {}

  private async executeGitCommand(args: string[], options?: { nullTerminated?: boolean }): Promise<GitCommandResult> {
    return new Promise((resolve) => {
      // Always add --color=never to prevent ANSI codes
      const colorlessArgs = ['-c', 'color.ui=never', ...args]
      
      const git = spawn('git', colorlessArgs, { 
        cwd: this.workingDirectory,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
      })
      
      let output = ''
      let error = ''
      
      git.stdout.on('data', (data) => {
        output += data.toString()
      })
      
      git.stderr.on('data', (data) => {
        error += data.toString()
      })
      
      git.on('close', (code) => {
        if (code === 0 || (code === 1 && args[0] === 'diff') || (code === 128 && args[0] === 'show')) {
          // git diff returns 1 when there are differences
          // git show returns 128 when object doesn't exist
          resolve({ success: true, output })
        } else {
          resolve({ success: false, error: error || `Git command failed with code ${code}` })
        }
      })
      
      git.on('error', (err) => {
        resolve({ success: false, error: err.message })
      })
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
    const result = await this.executeGitCommand(['status', '--porcelain', '-z'])
    if (!result.success) {
      throw new Error(result.error || 'Failed to get git status')
    }
    
    const files: GitStatusFile[] = []
    const entries = (result.output || '').split('\0').filter(Boolean)
    
    for (const entry of entries) {
      if (entry.length < 3) continue
      
      const indexStatus = entry[0]
      const workingStatus = entry[1]
      const rest = entry.substring(3)
      
      // Handle renames (format: "R  old -> new")
      let fileName: string
      let originalPath: string | undefined
      
      if ((indexStatus === 'R' || workingStatus === 'R') && rest.includes(' -> ')) {
        const [oldPath, newPath] = rest.split(' -> ')
        fileName = newPath
        originalPath = oldPath
      } else {
        fileName = rest
      }
      
      // Handle staged files
      if (indexStatus !== ' ' && indexStatus !== '?') {
        files.push({
          path: fileName,
          status: this.mapGitStatus(indexStatus),
          staged: true,
          originalPath: indexStatus === 'R' ? originalPath : undefined
        })
      }
      
      // Handle unstaged files
      if (workingStatus !== ' ') {
        files.push({
          path: fileName,
          status: this.mapGitStatus(workingStatus),
          staged: false,
          originalPath: workingStatus === 'R' ? originalPath : undefined
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
    
    return files
  }

  private mapGitStatus(status: string): GitStatusFile['status'] {
    // Extract the status letter (handle R100, C85, etc.)
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
  
  private extractRenameScore(status: string): number | undefined {
    const match = status.match(/^[RC](\d+)$/)
    return match ? parseInt(match[1], 10) : undefined
  }

  async getDiff(filePath?: string, staged: boolean = false): Promise<string> {
    // For untracked files, we need to show the file content as an addition
    if (filePath) {
      const status = await this.getStatus()
      const fileStatus = status.find(f => f.path === filePath)
      
      if (fileStatus?.status === 'untracked') {
        // Read the file content and format it as a diff
        try {
          const fullPath = path.join(this.workingDirectory, filePath)
          const content = await fs.readFile(fullPath, 'utf8')
          const lines = content.split('\n')
          
          // Format as a git diff for a new file
          let diff = `diff --git a/${filePath} b/${filePath}\n`
          diff += `new file mode 100644\n`
          diff += `index 0000000..0000000\n`
          diff += `--- /dev/null\n`
          diff += `+++ b/${filePath}\n`
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

  async getBaseBranch(): Promise<string> {
    // 1. Try upstream of HEAD first
    const upstream = await this.getUpstreamBranch()
    if (upstream) {
      return upstream
    }
    
    // 2. Try symbolic ref for origin/HEAD
    const originHeadResult = await this.executeGitCommand(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])
    if (originHeadResult.success && originHeadResult.output) {
      const branch = originHeadResult.output.trim().replace(/^origin\//, '')
      if (branch) {
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
        return branch
      }
    }
    
    throw new Error('Could not determine base branch')
  }

  async getPRBaseBranch(): Promise<string> {
    // For PRs, we want to find the main branch, not the upstream
    // 1. Try symbolic ref for origin/HEAD
    const originHeadResult = await this.executeGitCommand(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])
    if (originHeadResult.success && originHeadResult.output) {
      const branch = originHeadResult.output.trim().replace(/^origin\//, '')
      if (branch) {
        return branch
      }
    }
    
    // 2. Probe for common branch names
    const checkBranch = async (branch: string): Promise<boolean> => {
      const result = await this.executeGitCommand(['rev-parse', '--verify', branch])
      return result.success
    }
    
    for (const branch of ['main', 'master', 'develop', 'development']) {
      if (await checkBranch(branch)) {
        return branch
      }
    }
    
    throw new Error('Could not determine PR base branch')
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
      if ((statusPart === 'R' || statusPart === 'C') && i < parts.length && parts[i]) {
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
    
    const result = await this.executeGitCommand(['diff', '--binary', '-M', `${baseBranch}...${target}`, '--', filePath])
    if (!result.success) {
      throw new Error(result.error || 'Failed to get file diff between branches')
    }
    
    return result.output || ''
  }

  async getFileContentFromBranch(filePath: string, branch: string): Promise<string> {
    const result = await this.executeGitCommand(['show', `${branch}:${filePath}`])
    if (!result.success) {
      // File might not exist in that branch - this is not an error
      return ''
    }
    return result.output || ''
  }
}