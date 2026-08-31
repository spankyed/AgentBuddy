type TerminalOutputHandler = (terminalId: string, data: string) => void

class TerminalEventBus {
  private handlers = new Map<string, Set<TerminalOutputHandler>>()
  private outputs = new Map<string, string>()
  private readonly STORAGE_KEY_PREFIX = 'agentbuddy_terminal_output_'
  private readonly USE_LOCAL_STORAGE = true // Can be made configurable
  private readonly MAX_OUTPUT_LENGTH = 1000000 // 1MB limit per terminal
  private saveTimers = new Map<string, NodeJS.Timeout>()
  private readonly SAVE_DEBOUNCE_MS = 500 // Debounce localStorage writes
  
  constructor() {
    // Load any persisted outputs from localStorage on startup
    if (this.USE_LOCAL_STORAGE && typeof window !== 'undefined') {
      this.loadFromLocalStorage()
    }
  }
  
  private loadFromLocalStorage() {
    try {
      // Find all terminal output keys in localStorage
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith(this.STORAGE_KEY_PREFIX)) {
          const terminalId = key.substring(this.STORAGE_KEY_PREFIX.length)
          const output = localStorage.getItem(key)
          if (output) {
            this.outputs.set(terminalId, output)
          }
        }
      }
    } catch (e) {
      console.warn('Failed to load terminal outputs from localStorage:', e)
    }
  }
  
  private saveToLocalStorage(terminalId: string, output: string) {
    if (!this.USE_LOCAL_STORAGE || typeof window === 'undefined') return

    // Clear existing timer for this terminal
    const existingTimer = this.saveTimers.get(terminalId)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    // Set new debounced save
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(this.STORAGE_KEY_PREFIX + terminalId, output)
        this.saveTimers.delete(terminalId)
      } catch (e) {
        // Handle quota exceeded or other errors
        console.warn('Failed to save terminal output to localStorage:', e)

        // If quota exceeded, try to clear orphaned entries first
        if (e instanceof Error && e.name === 'QuotaExceededError') {
          this.reclaimQuota(terminalId)
          // Retry once after clearing
          try {
            localStorage.setItem(this.STORAGE_KEY_PREFIX + terminalId, output)
          } catch (retryError) {
            console.error('Failed to save even after reclaiming quota:', retryError)
          }
        }
      }
    }, this.SAVE_DEBOUNCE_MS)

    this.saveTimers.set(terminalId, timer)
  }
  
  private removeFromLocalStorage(terminalId: string) {
    if (!this.USE_LOCAL_STORAGE || typeof window === 'undefined') return
    
    try {
      localStorage.removeItem(this.STORAGE_KEY_PREFIX + terminalId)
    } catch (e) {
      console.warn('Failed to remove terminal output from localStorage:', e)
    }
  }
  
  subscribe(terminalId: string, handler: TerminalOutputHandler) {
    if (!this.handlers.has(terminalId)) {
      this.handlers.set(terminalId, new Set())
    }
    this.handlers.get(terminalId)!.add(handler)
    
    // Return unsubscribe function
    return () => {
      const handlers = this.handlers.get(terminalId)
      if (handlers) {
        handlers.delete(handler)
        if (handlers.size === 0) {
          this.handlers.delete(terminalId)
        }
      }
    }
  }
  
  emit(terminalId: string, data: string) {
    // Store the output efficiently
    const existingOutput = this.outputs.get(terminalId)
    let currentOutput: string
    
    if (existingOutput) {
      // Use array join for better performance with large strings
      currentOutput = existingOutput + data
    } else {
      currentOutput = data
    }
    
    // Apply size limit with circular buffer behavior. Trim on a newline
    // boundary so we never split an ANSI escape sequence mid-bytes, which
    // would silently corrupt replay colors/cursor/etc. on the next app
    // start. Falls back to the raw cut only in the degenerate case where
    // no newline appears in the keep window (e.g. a single very long line).
    if (currentOutput.length > this.MAX_OUTPUT_LENGTH) {
      const keepLength = Math.floor(this.MAX_OUTPUT_LENGTH * 0.9)
      const cut = currentOutput.length - keepLength
      const nl = currentOutput.indexOf('\n', cut)
      currentOutput = nl >= 0 ? currentOutput.slice(nl + 1) : currentOutput.slice(cut)
    }
    
    this.outputs.set(terminalId, currentOutput)
    this.saveToLocalStorage(terminalId, currentOutput) // Now debounced
    
    // Notify all handlers
    const handlers = this.handlers.get(terminalId)
    if (handlers) {
      handlers.forEach(handler => handler(terminalId, data))
    }
  }
  
  getOutput(terminalId: string): string {
    return this.outputs.get(terminalId) || ''
  }
  
  clearOutput(terminalId: string) {
    // Cancel any pending saves
    const timer = this.saveTimers.get(terminalId)
    if (timer) {
      clearTimeout(timer)
      this.saveTimers.delete(terminalId)
    }
    
    this.outputs.delete(terminalId)
    this.removeFromLocalStorage(terminalId)
  }
  
  clearAll() {
    // Cancel all pending saves
    for (const timer of this.saveTimers.values()) {
      clearTimeout(timer)
    }
    this.saveTimers.clear()
    
    // Clear all outputs
    for (const terminalId of this.outputs.keys()) {
      this.removeFromLocalStorage(terminalId)
    }
    this.outputs.clear()
  }

  prunePersistedOutputs(liveTerminalIds: Iterable<string>) {
    if (!this.USE_LOCAL_STORAGE || typeof window === 'undefined') return

    try {
      const liveIds = new Set(liveTerminalIds)
      const prefix = this.STORAGE_KEY_PREFIX
      const staleKeys: string[] = []

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (!key || !key.startsWith(prefix)) continue
        const id = key.substring(prefix.length)
        if (!liveIds.has(id)) staleKeys.push(key)
      }

      for (const key of staleKeys) {
        localStorage.removeItem(key)
      }
    } catch (e) {
      console.warn('Failed to prune stale terminal output cache:', e)
    }
  }
  
  /**
   * Reclaim localStorage quota without destroying active terminal scrollback.
   * Drops only entries whose terminal id isn't known to this session — those
   * are stale from prior runs (terminal was killed or app was closed without
   * cleanup). The currently-writing terminal (`activeId`) and every entry in
   * `this.outputs` are preserved. We do not fall back to deleting live
   * entries; if this isn't enough to recover quota, the save simply fails
   * and is logged by the caller — better than silently losing scrollback.
   */
  private reclaimQuota(activeId: string) {
    try {
      const prefix = this.STORAGE_KEY_PREFIX
      const liveIds = new Set<string>(this.outputs.keys())
      liveIds.add(activeId)

      const orphanKeys: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (!key || !key.startsWith(prefix)) continue
        const id = key.substring(prefix.length)
        if (!liveIds.has(id)) orphanKeys.push(key)
      }

      for (const key of orphanKeys) {
        localStorage.removeItem(key)
      }
    } catch (e) {
      console.error('Failed to reclaim localStorage quota:', e)
    }
  }
}

export const terminalEventBus = new TerminalEventBus()
