import * as path from 'path'
import * as chokidar from 'chokidar'
import * as fs from 'fs/promises'

export interface GitChangeInfo {
  type: 'index' | 'head' | 'commit' | 'working'
  timestamp: Date
}

export class GitWatcherService {
  private watcher?: chokidar.FSWatcher
  private onChangeCallback?: () => void
  private changeTimeout?: NodeJS.Timeout
  private isWatching = false
  
  constructor(private workingDirectory: string) {}

  setChangeCallback(callback: () => void) {
    this.onChangeCallback = callback
  }

  async startWatching(): Promise<void> {
    if (this.isWatching) {
      return
    }

    const gitDir = path.join(this.workingDirectory, '.git')
    
    // Check if .git directory exists
    try {
      await fs.access(gitDir)
    } catch {
      console.log('No .git directory found, skipping git watch')
      return
    }

    // Watch specific git files that indicate status changes
    const watchPaths = [
      path.join(gitDir, 'index'),           // Staging area changes
      path.join(gitDir, 'HEAD'),            // Branch changes
      path.join(gitDir, 'COMMIT_EDITMSG'),  // Recent commits
      path.join(gitDir, 'refs', 'heads'),   // Branch updates
    ]

    this.watcher = chokidar.watch(watchPaths, {
      persistent: true,
      ignoreInitial: true,
      // Don't follow symlinks to avoid watching outside .git
      followSymlinks: false,
      // Ignore dot files except the ones we explicitly watch
      ignored: /\/\.[^/]+$/,
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 100
      }
    })

    this.watcher
      .on('change', (filePath) => {
        this.handleGitChange('change', filePath)
      })
      .on('add', (filePath) => {
        this.handleGitChange('add', filePath)
      })
      .on('unlink', (filePath) => {
        this.handleGitChange('unlink', filePath)
      })
      .on('error', (error) => {
        console.error('Git watcher error:', error)
      })
      .on('ready', () => {
        console.log('Git watcher ready')
        this.isWatching = true
      })
  }

  private handleGitChange(event: string, filePath: string) {
    // Debounce git changes since multiple files might change at once
    if (this.changeTimeout) {
      clearTimeout(this.changeTimeout)
    }

    this.changeTimeout = setTimeout(() => {
      if (this.onChangeCallback) {
        // Determine what type of change occurred
        const changeType = this.getChangeType(filePath)
        console.log(`Git change detected: ${event} on ${changeType} (${filePath})`)
        this.onChangeCallback()
      }
    }, 500) // 500ms debounce for git operations
  }

  private getChangeType(filePath: string): string {
    if (filePath.includes('index')) return 'index'
    if (filePath.includes('HEAD')) return 'head'
    if (filePath.includes('COMMIT_EDITMSG')) return 'commit'
    if (filePath.includes('refs/heads')) return 'branch'
    return 'other'
  }

  async stopWatching(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close()
      this.watcher = undefined
      this.isWatching = false
    }
    
    if (this.changeTimeout) {
      clearTimeout(this.changeTimeout)
      this.changeTimeout = undefined
    }
  }

  isActive(): boolean {
    return this.isWatching
  }
}