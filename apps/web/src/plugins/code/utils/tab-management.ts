/**
 * Shared utilities for managing tabs in the code editor
 */

// Base tab interface - all tabs must have at least a path
interface BaseTab {
  path: string
}

/**
 * Merges new tabs with existing tabs, handling deduplication and active tab selection
 * @param openFiles - Current array of open tabs
 * @param newTabs - New tabs to add or update
 * @param activeFilePath - Desired active tab path (optional)
 * @returns Object with updated openFiles and activeFilePath
 */
export function mergeTabs<T extends BaseTab>(
  openFiles: T[],
  newTabs: T[],
  activeFilePath?: string | null
): { openFiles: T[]; activeFilePath: string | null } {
  // Create a set of paths for new tabs for efficient lookup
  const newTabPaths = new Set(newTabs.map(tab => tab.path))
  
  // Filter out existing tabs that will be replaced
  const filteredExisting = openFiles.filter(tab => !newTabPaths.has(tab.path))
  
  // Combine filtered existing with new tabs
  const mergedTabs = [...filteredExisting, ...newTabs]
  
  // Determine active file path
  let finalActiveFilePath = activeFilePath
  
  // If no active path specified, keep current if it still exists
  if (!finalActiveFilePath && openFiles.length > 0) {
    // Find current active from original files
    const currentActive = openFiles.find(f => f.path === activeFilePath)
    if (currentActive && mergedTabs.some(f => f.path === currentActive.path)) {
      finalActiveFilePath = currentActive.path
    }
  }
  
  // If still no active path and we have new tabs, use the first new tab
  if (!finalActiveFilePath && newTabs.length > 0) {
    finalActiveFilePath = newTabs[0].path
  }
  
  // If still no active path and we have any tabs, use the first one
  if (!finalActiveFilePath && mergedTabs.length > 0) {
    finalActiveFilePath = mergedTabs[0].path
  }
  
  return {
    openFiles: mergedTabs,
    activeFilePath: finalActiveFilePath || null
  }
}

/**
 * Removes tabs by path and manages active tab selection
 * @param openFiles - Current array of open tabs
 * @param pathsToRemove - Single path or array of paths to remove
 * @param currentActive - Current active tab path
 * @returns Object with updated openFiles and activeFilePath
 */
export function removeTabs<T extends BaseTab>(
  openFiles: T[],
  pathsToRemove: string | string[],
  currentActive?: string | null
): { openFiles: T[]; activeFilePath: string | null } {
  const pathsSet = new Set(Array.isArray(pathsToRemove) ? pathsToRemove : [pathsToRemove])
  
  // Filter out tabs to remove
  const filteredTabs = openFiles.filter(tab => !pathsSet.has(tab.path))
  
  // Determine new active file if current was removed
  let newActiveFilePath = currentActive
  
  if (currentActive && pathsSet.has(currentActive)) {
    // Current active was removed, find a new one
    if (filteredTabs.length > 0) {
      // Try to find the tab that was after the removed one
      const removedIndex = openFiles.findIndex(f => f.path === currentActive)
      if (removedIndex >= 0) {
        // Look for next available tab after removed position
        for (let i = removedIndex; i < openFiles.length; i++) {
          const tab = openFiles[i]
          if (!pathsSet.has(tab.path)) {
            newActiveFilePath = tab.path
            break
          }
        }
        
        // If nothing found after, look before
        if (!newActiveFilePath || pathsSet.has(newActiveFilePath)) {
          for (let i = removedIndex - 1; i >= 0; i--) {
            const tab = openFiles[i]
            if (!pathsSet.has(tab.path)) {
              newActiveFilePath = tab.path
              break
            }
          }
        }
      }
      
      // Fallback to first available tab
      if (!newActiveFilePath || pathsSet.has(newActiveFilePath)) {
        newActiveFilePath = filteredTabs[0].path
      }
    } else {
      newActiveFilePath = null
    }
  }
  
  return {
    openFiles: filteredTabs,
    activeFilePath: newActiveFilePath || null
  }
}

/**
 * Updates properties of tabs matching the given path
 * @param openFiles - Current array of open tabs
 * @param path - Path of tab(s) to update
 * @param updates - Properties to update
 * @returns Updated array of tabs
 */
export function updateTabs<T extends BaseTab>(
  openFiles: T[],
  path: string,
  updates: Partial<T>
): T[] {
  return openFiles.map(tab => 
    tab.path === path 
      ? { ...tab, ...updates }
      : tab
  )
}

/**
 * Updates or adds a tab with the given properties
 * @param openFiles - Current array of open tabs
 * @param newTab - Tab to add or update
 * @returns Updated array of tabs
 */
export function upsertTab<T extends BaseTab>(
  openFiles: T[],
  newTab: T
): T[] {
  const existingIndex = openFiles.findIndex(tab => tab.path === newTab.path)
  
  if (existingIndex >= 0) {
    // Update existing tab
    const updated = [...openFiles]
    updated[existingIndex] = newTab
    return updated
  } else {
    // Add new tab
    return [...openFiles, newTab]
  }
}

/**
 * Batch updates multiple tabs at once
 * @param openFiles - Current array of open tabs
 * @param updates - Map of path to updates
 * @returns Updated array of tabs
 */
export function batchUpdateTabs<T extends BaseTab>(
  openFiles: T[],
  updates: Map<string, Partial<T>>
): T[] {
  return openFiles.map(tab => {
    const tabUpdates = updates.get(tab.path)
    return tabUpdates ? { ...tab, ...tabUpdates } : tab
  })
}