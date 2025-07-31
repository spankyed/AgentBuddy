import * as fs from 'fs/promises'
import * as path from 'path'
import * as chokidar from 'chokidar'

export interface FileChangeInfo {
  path: string
  modifiedAt: Date
  changeType: 'add' | 'change' | 'unlink'
}

export class FileWatcherService {
  private watchers: Map<string, chokidar.FSWatcher> = new Map()
  private fileModificationTimes: Map<string, number> = new Map()
  private onChangeCallback?: (change: FileChangeInfo) => void
  private changeTimeouts: Map<string, NodeJS.Timeout> = new Map()

  constructor() {
    // Initialize service
  }

  setChangeCallback(callback: (change: FileChangeInfo) => void) {
    this.onChangeCallback = callback
  }

  async watchFile(filePath: string): Promise<void> {
    // Normalize the path
    const normalizedPath = path.normalize(filePath)
    
    // If already watching this file, don't create duplicate watcher
    if (this.watchers.has(normalizedPath)) {
      return
    }

    try {
      // Store initial modification time
      const stats = await fs.stat(normalizedPath)
      this.fileModificationTimes.set(normalizedPath, stats.mtimeMs)

      // Create watcher for this specific file
      const watcher = chokidar.watch(normalizedPath, {
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: 100,
          pollInterval: 100
        }
      })

      watcher
        .on('change', async () => {
          try {
            const newStats = await fs.stat(normalizedPath)
            const lastModTime = this.fileModificationTimes.get(normalizedPath) || 0
            
            // Only trigger if modification time actually changed
            if (newStats.mtimeMs > lastModTime) {
              this.fileModificationTimes.set(normalizedPath, newStats.mtimeMs)
              this.debounceFileChange({
                path: normalizedPath,
                modifiedAt: newStats.mtime,
                changeType: 'change'
              })
            }
          } catch (error) {
            console.error(`Error processing file change for ${normalizedPath}:`, error)
          }
        })
        .on('unlink', () => {
          this.handleFileChange({
            path: normalizedPath,
            modifiedAt: new Date(),
            changeType: 'unlink'
          })
          // Stop watching deleted files
          this.unwatchFile(normalizedPath)
        })
        .on('error', (error) => {
          console.error(`Watcher error for ${normalizedPath}:`, error)
        })

      this.watchers.set(normalizedPath, watcher)
    } catch (error) {
      console.error(`Failed to watch file ${normalizedPath}:`, error)
      throw error
    }
  }

  async unwatchFile(filePath: string): Promise<void> {
    const normalizedPath = path.normalize(filePath)
    const watcher = this.watchers.get(normalizedPath)
    
    if (watcher) {
      await watcher.close()
      this.watchers.delete(normalizedPath)
      this.fileModificationTimes.delete(normalizedPath)
      
      // Clear any pending timeouts
      const timeout = this.changeTimeouts.get(normalizedPath)
      if (timeout) {
        clearTimeout(timeout)
        this.changeTimeouts.delete(normalizedPath)
      }
    }
  }

  async unwatchAll(): Promise<void> {
    const closePromises = Array.from(this.watchers.values()).map(
      watcher => watcher.close()
    )
    await Promise.all(closePromises)
    this.watchers.clear()
    this.fileModificationTimes.clear()
    
    // Clear all timeouts
    for (const timeout of this.changeTimeouts.values()) {
      clearTimeout(timeout)
    }
    this.changeTimeouts.clear()
  }

  private debounceFileChange(change: FileChangeInfo) {
    // Clear existing timeout for this file
    const existingTimeout = this.changeTimeouts.get(change.path)
    if (existingTimeout) {
      clearTimeout(existingTimeout)
    }

    // Set new timeout
    const timeout = setTimeout(() => {
      this.changeTimeouts.delete(change.path)
      this.handleFileChange(change)
    }, 100)

    this.changeTimeouts.set(change.path, timeout)
  }

  private handleFileChange(change: FileChangeInfo) {
    if (this.onChangeCallback) {
      this.onChangeCallback(change)
    }
  }

  getWatchedFiles(): string[] {
    return Array.from(this.watchers.keys())
  }

  isWatching(filePath: string): boolean {
    return this.watchers.has(path.normalize(filePath))
  }
}