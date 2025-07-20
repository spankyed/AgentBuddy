import { spawn } from 'child_process'
import * as path from 'path'

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
      
      // Handle untracked files
      if (indexStatus === '?' && workingStatus === '?') {
        files.push({
          path: fileName,
          status: 'untracked',
          staged: false
        })
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
}