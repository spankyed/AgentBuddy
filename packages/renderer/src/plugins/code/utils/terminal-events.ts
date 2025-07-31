import { reactive } from 'vue'

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
        
        // If quota exceeded, try to clear old entries
        if (e instanceof Error && e.name === 'QuotaExceededError') {
          this.clearOldEntries()
          // Retry once after clearing
          try {
            localStorage.setItem(this.STORAGE_KEY_PREFIX + terminalId, output)
          } catch (retryError) {
            console.error('Failed to save even after clearing old entries:', retryError)
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
    
    // Apply size limit with circular buffer behavior
    if (currentOutput.length > this.MAX_OUTPUT_LENGTH) {
      // Keep the last 90% to avoid constant trimming
      const keepLength = Math.floor(this.MAX_OUTPUT_LENGTH * 0.9)
      currentOutput = currentOutput.slice(-keepLength)
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
  
  private clearOldEntries() {
    try {
      const entries: Array<{ key: string; time: number }> = []
      
      // Collect all terminal output entries with timestamps
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith(this.STORAGE_KEY_PREFIX)) {
          // Try to parse a timestamp from the stored data or use 0
          entries.push({ key, time: 0 })
        }
      }
      
      // Remove oldest half of entries
      const entriesToRemove = Math.floor(entries.length / 2)
      for (let i = 0; i < entriesToRemove; i++) {
        localStorage.removeItem(entries[i].key)
      }
    } catch (e) {
      console.error('Failed to clear old localStorage entries:', e)
    }
  }
}

export const terminalEventBus = new TerminalEventBus()