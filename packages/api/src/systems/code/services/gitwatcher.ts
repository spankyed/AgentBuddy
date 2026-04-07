import * as path from 'path'
import * as chokidar from 'chokidar'
import * as fs from 'fs/promises'
import { GitRepository } from './git'

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
  private gitStatusDebounceTimeout?: NodeJS.Timeout
  private fileChangeTimeouts: Map<string, NodeJS.Timeout> = new Map()
  private isWatching = false
  private openFiles: Set<string> = new Set()
  private gitRepository?: GitRepository

  constructor(private workingDirectory: string) {}

  setGitRepository(repo: GitRepository): void {
    this.gitRepository = repo
  }

  setChangeCallback(callback: () => void) {
    this.onGitChangeCallback = callback
  }

  setFileChangeCallback(callback: (change: FileChangeInfo) => void) {
    this.onFileChangeCallback = callback
  }

  registerOpenFile(filePath: string): void {
    // Normalize to absolute path for consistency with chokidar
    const normalized = path.resolve(filePath)
    this.openFiles.add(normalized)
  }

  unregisterOpenFile(filePath: string): void {
    const normalized = path.resolve(filePath)
    this.openFiles.delete(normalized)
  }

  isFileOpen(filePath: string): boolean {
    const normalized = path.resolve(filePath)
    return this.openFiles.has(normalized)
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
      path.join(gitDir, 'MERGE_HEAD'),      // During merges
      path.join(gitDir, 'REBASE_HEAD'),     // During rebases
      path.join(gitDir, 'CHERRY_PICK_HEAD'), // During cherry-picks
      path.join(gitDir, 'ORIG_HEAD'),       // Previous HEAD position
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
    // Debounce git status refresh globally (we only need one refresh for all changes)
    if (this.gitStatusDebounceTimeout) {
      clearTimeout(this.gitStatusDebounceTimeout)
    }

    // If a write is in progress, defer the callback until it finishes
    // instead of racing with it on a timer
    if (this.gitRepository?.isWriteInProgress) {
      this.gitRepository.onWriteComplete(() => {
        // Re-debounce: another write may have started in the meantime
        if (this.gitStatusDebounceTimeout) {
          clearTimeout(this.gitStatusDebounceTimeout)
        }
        this.gitStatusDebounceTimeout = setTimeout(() => {
          if (this.onGitChangeCallback) {
            this.onGitChangeCallback()
          }
        }, 100) // shorter debounce after write completes — the lock is already released
      })
    } else {
      this.gitStatusDebounceTimeout = setTimeout(() => {
        if (this.onGitChangeCallback) {
          this.onGitChangeCallback()
        }
      }, 500)
    }

    // Per-file debouncing for file change notifications (so we don't lose notifications)
    if (this.openFiles.has(filePath) && this.onFileChangeCallback) {
      // Clear existing timeout for this specific file
      const existingTimeout = this.fileChangeTimeouts.get(filePath)
      if (existingTimeout) {
        clearTimeout(existingTimeout)
      }

      // Set new timeout for this file
      const timeout = setTimeout(() => {
        this.fileChangeTimeouts.delete(filePath)
        if (this.onFileChangeCallback) {
          this.onFileChangeCallback({
            path: filePath,
            modifiedAt: new Date(),
            changeType
          })
        }
      }, 300) // Shorter debounce for file notifications

      this.fileChangeTimeouts.set(filePath, timeout)
    }
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

    // Clear all debounce timeouts
    if (this.gitStatusDebounceTimeout) {
      clearTimeout(this.gitStatusDebounceTimeout)
      this.gitStatusDebounceTimeout = undefined
    }

    for (const timeout of this.fileChangeTimeouts.values()) {
      clearTimeout(timeout)
    }
    this.fileChangeTimeouts.clear()

    // Clear open files set
    this.openFiles.clear()
  }

  isActive(): boolean {
    return this.isWatching
  }
}