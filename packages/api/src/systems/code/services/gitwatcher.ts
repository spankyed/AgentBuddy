import * as path from 'path'
import * as chokidar from 'chokidar'
import * as fs from 'fs/promises'

export interface FileChangeInfo {
  path: string
  modifiedAt: Date
  changeType: 'add' | 'change' | 'unlink'
}

export class GitWatcherService {
  private gitWatcher?: chokidar.FSWatcher
  private workingDirWatcher?: chokidar.FSWatcher
  private onGitChangeCallback?: () => void
  private onFileChangeCallback?: (change: FileChangeInfo) => void
  private changeTimeout?: NodeJS.Timeout
  private isWatching = false
  private openFiles: Set<string> = new Set()

  constructor(private workingDirectory: string) {}

  setChangeCallback(callback: () => void) {
    this.onGitChangeCallback = callback
  }

  setFileChangeCallback(callback: (change: FileChangeInfo) => void) {
    this.onFileChangeCallback = callback
  }

  registerOpenFile(filePath: string): void {
    this.openFiles.add(filePath)
  }

  unregisterOpenFile(filePath: string): void {
    this.openFiles.delete(filePath)
  }

  isFileOpen(filePath: string): boolean {
    return this.openFiles.has(filePath)
  }

  getOpenFiles(): string[] {
    return Array.from(this.openFiles)
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

    // Watch specific git files that indicate status changes (staged/committed changes)
    const watchPaths = [
      path.join(gitDir, 'index'),           // Staging area changes
      path.join(gitDir, 'HEAD'),            // Branch changes
      path.join(gitDir, 'COMMIT_EDITMSG'),  // Recent commits
      path.join(gitDir, 'refs', 'heads'),   // Branch updates
    ]

    this.gitWatcher = chokidar.watch(watchPaths, {
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

    this.gitWatcher
      .on('change', (filePath) => {
        this.handleFileChange('change', filePath)
      })
      .on('add', (filePath) => {
        this.handleFileChange('add', filePath)
      })
      .on('unlink', (filePath) => {
        this.handleFileChange('unlink', filePath)
      })
      .on('error', (error) => {
        console.error('Git watcher error:', error)
      })
      .on('ready', () => {
        console.log('Git watcher ready')
        this.isWatching = true
      })

    // Watch working directory for file changes (unstaged changes)
    // Exclude common directories that shouldn't trigger git status updates
    this.workingDirWatcher = chokidar.watch(this.workingDirectory, {
      persistent: true,
      ignoreInitial: true,
      followSymlinks: false,
      // Ignore patterns for performance
      ignored: [
        // Git directory
        '**/.git/**',
        // Dependencies
        '**/node_modules/**',
        // Build outputs
        '**/dist/**',
        '**/build/**',
        '**/out/**',
        '**/.next/**',
        // IDE and temp files
        '**/.vscode/**',
        '**/.idea/**',
        '**/.DS_Store',
        '**/Thumbs.db',
        // Logs
        '**/logs/**',
        '**/*.log',
        // Common cache directories
        '**/.cache/**',
        '**/tmp/**',
        '**/temp/**',
        // Coverage
        '**/coverage/**',
        '**/.nyc_output/**'
      ],
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100
      }
    })

    this.workingDirWatcher
      .on('change', (filePath) => {
        this.handleFileChange('change', filePath)
      })
      .on('add', (filePath) => {
        this.handleFileChange('add', filePath)
      })
      .on('unlink', (filePath) => {
        this.handleFileChange('unlink', filePath)
      })
      .on('error', (error) => {
        console.error('Working directory watcher error:', error)
      })
      .on('ready', () => {
        console.log('Working directory watcher ready')
      })
  }

  private handleFileChange(changeType: 'add' | 'change' | 'unlink', filePath: string) {
    // Debounce changes since multiple files might change at once
    if (this.changeTimeout) {
      clearTimeout(this.changeTimeout)
    }

    this.changeTimeout = setTimeout(() => {
      // Always refresh git status (any file change might affect git)
      if (this.onGitChangeCallback) {
        this.onGitChangeCallback()
      }

      // If file is open, notify explorer (for external change detection)
      if (this.openFiles.has(filePath) && this.onFileChangeCallback) {
        this.onFileChangeCallback({
          path: filePath,
          modifiedAt: new Date(),
          changeType
        })
      }
    }, 500) // 500ms debounce
  }

  async stopWatching(): Promise<void> {
    if (this.gitWatcher) {
      await this.gitWatcher.close()
      this.gitWatcher = undefined
    }

    if (this.workingDirWatcher) {
      await this.workingDirWatcher.close()
      this.workingDirWatcher = undefined
    }

    this.isWatching = false

    if (this.changeTimeout) {
      clearTimeout(this.changeTimeout)
      this.changeTimeout = undefined
    }
  }

  isActive(): boolean {
    return this.isWatching
  }
}