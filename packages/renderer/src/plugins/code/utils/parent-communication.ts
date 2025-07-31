/**
 * Shared utilities for parent-child state machine communication
 */

/**
 * Safely update parent state with error handling
 * @param self - The child state machine instance
 * @param updates - Partial state updates to send to parent
 */
export const updateParentState = (self: any, updates: any) => {
  try {
    if (self._parent) {
      self._parent.send({
        type: 'UPDATE_STATE',
        updates
      })
    }
  } catch (error) {
    console.error('Failed to update parent state:', error)
  }
}

/**
 * Safely access parent context with error handling
 * @param self - The child state machine instance
 * @returns Parent context or null if access fails
 */
export const getParentContext = (self: any) => {
  try {
    return self._parent?.getSnapshot()?.context
  } catch (error) {
    console.error('Failed to access parent context:', error)
    return null
  }
} 