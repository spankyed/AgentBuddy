/**
 * Utility for managing recently opened files
 */

interface RecentFile {
  path: string
  timestamp: number
}

const STORAGE_KEY = 'code-plugin-recent-files'
const MAX_RECENT_FILES = 50

/**
 * Load recently opened files from localStorage
 */
export function loadRecentFiles(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return []
    
    const recentFiles: RecentFile[] = JSON.parse(stored)
    if (!Array.isArray(recentFiles)) return []
    
    // Sort by timestamp (most recent first) and return just paths
    return recentFiles
      .sort((a, b) => b.timestamp - a.timestamp)
      .map(f => f.path)
      .slice(0, MAX_RECENT_FILES)
  } catch (error) {
    console.error('Failed to load recent files:', error)
    return []
  }
}

/**
 * Save recently opened files to localStorage
 */
export function saveRecentFiles(recentFiles: string[]): void {
  try {
    const timestampedFiles: RecentFile[] = recentFiles.map((path, index) => ({
      path,
      // Use inverse index to maintain order (most recent = highest timestamp)
      timestamp: Date.now() - index
    }))
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(timestampedFiles))
  } catch (error) {
    console.error('Failed to save recent files:', error)
  }
}

/**
 * Add a file to the recent files list
 */
export function addRecentFile(recentFiles: string[], filePath: string): string[] {
  // Remove the file if it already exists (we'll add it to the front)
  const filtered = recentFiles.filter(path => path !== filePath)
  
  // Add to the beginning and limit size
  const updated = [filePath, ...filtered].slice(0, MAX_RECENT_FILES)
  
  // Save to localStorage
  saveRecentFiles(updated)
  
  return updated
}

/**
 * Remove a file from the recent files list
 */
export function removeRecentFile(recentFiles: string[], filePath: string): string[] {
  const filtered = recentFiles.filter(path => path !== filePath)
  
  // Save to localStorage
  saveRecentFiles(filtered)
  
  return filtered
}

/**
 * Clear all recent files
 */
export function clearRecentFiles(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch (error) {
    console.error('Failed to clear recent files:', error)
  }
}

/**
 * Get recency score for a file (higher = more recent)
 */
export function getRecencyScore(recentFiles: string[], filePath: string): number {
  const index = recentFiles.indexOf(filePath)
  if (index === -1) return 0
  
  // Score from 100 (most recent) down to 2 (least recent)
  // This ensures recent files get a noticeable boost without overwhelming exact matches
  const maxScore = 100
  const minScore = 2
  const score = maxScore - (index * (maxScore - minScore) / Math.min(recentFiles.length - 1, MAX_RECENT_FILES - 1))
  
  return Math.max(score, minScore)
}