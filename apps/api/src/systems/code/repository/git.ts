import { spawn } from 'child_process'
import * as path from 'path'
import * as fs from 'fs/promises'

interface GitStatusFile {
  path: string
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'copied'
  staged: boolean
}

interface GitCommandResult {
  success: boolean
  output?: string
  error?: string
}

export class GitRepository {
  constructor(private workingDirectory: string) {}

  private async executeGitCommand(args: string[]): Promise<GitCommandResult> {
    return new Promise((resolve) => {
      const git = spawn('git', args, { 
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
        if (code === 0 || (code === 1 && args[0] === 'diff')) {
          // git diff returns 1 when there are differences, which is not an error
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
    const result = await this.executeGitCommand(['status', '--porcelain'])
    if (!result.success) {
      throw new Error(result.error || 'Failed to get git status')
    }
    
    const files: GitStatusFile[] = []
    const lines = (result.output || '').split('\n').filter(Boolean)
    
    for (const line of lines) {
      if (line.length < 3) continue
      
      const indexStatus = line[0]
      const workingStatus = line[1]
      const fileName = line.substring(3)
      
      // Handle staged files
      if (indexStatus !== ' ' && indexStatus !== '?') {
        files.push({
          path: fileName,
          status: this.mapGitStatus(indexStatus),
          staged: true
        })
      }
      
      // Handle unstaged files
      if (workingStatus !== ' ') {
        files.push({
          path: fileName,
          status: this.mapGitStatus(workingStatus),
          staged: false
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
    switch (status) {
      case 'M': return 'modified'
      case 'A': return 'added'
      case 'D': return 'deleted'
      case 'R': return 'renamed'
      case 'C': return 'copied'
      case '?': return 'untracked'
      default: return 'modified'
    }
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
    
    const args = ['diff']
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

  async getBaseBranch(): Promise<string> {
    // Try to find the main branch (could be 'main' or 'master')
    const checkBranch = async (branch: string): Promise<boolean> => {
      const result = await this.executeGitCommand(['rev-parse', '--verify', branch])
      return result.success
    }
    
    if (await checkBranch('main')) {
      return 'main'
    } else if (await checkBranch('master')) {
      return 'master'
    }
    
    // Fallback: get the default branch from origin
    const result = await this.executeGitCommand(['symbolic-ref', 'refs/remotes/origin/HEAD'])
    if (result.success && result.output) {
      const match = result.output.match(/refs\/remotes\/origin\/(.+)/)
      if (match) {
        return match[1].trim()
      }
    }
    
    throw new Error('Could not determine base branch')
  }

  async getBranchDiff(baseBranch: string, targetBranch?: string): Promise<GitStatusFile[]> {
    const target = targetBranch || 'HEAD'
    
    // Get the list of changed files between branches
    const result = await this.executeGitCommand(['diff', '--name-status', `${baseBranch}...${target}`])
    if (!result.success) {
      throw new Error(result.error || 'Failed to get branch diff')
    }
    
    const files: GitStatusFile[] = []
    const lines = (result.output || '').split('\n').filter(Boolean)
    
    for (const line of lines) {
      const match = line.match(/^([AMDRC])\s+(.+)$/)
      if (match) {
        const [, status, filePath] = match
        files.push({
          path: filePath,
          status: this.mapGitStatus(status),
          staged: false // Not applicable for branch diffs
        })
      }
    }
    
    return files
  }

  async getFileDiffBetweenBranches(filePath: string, baseBranch: string, targetBranch?: string): Promise<string> {
    const target = targetBranch || 'HEAD'
    
    const result = await this.executeGitCommand(['diff', `${baseBranch}...${target}`, '--', filePath])
    if (!result.success) {
      throw new Error(result.error || 'Failed to get file diff between branches')
    }
    
    return result.output || ''
  }

  async getFileContentFromBranch(filePath: string, branch: string): Promise<string> {
    const result = await this.executeGitCommand(['show', `${branch}:${filePath}`])
    if (!result.success) {
      // File might not exist in that branch
      return ''
    }
    return result.output || ''
  }
}