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
export const addTabToParent = (self: any, tab: any, replacePreview?: boolean, extraUpdates?: any) => {
  try {
    if (self._parent) {
      self._parent.send({
        type: 'ADD_TAB',
        tab,
        replacePreview,
        extraUpdates
      })
    }
  } catch (error) {
    console.error('Failed to add tab to parent:', error)
  }
}

/**
 * Send an arbitrary event to the parent actor.
 * Preferred over updateParentState when the parent should handle the event
 * with its own current context (avoids stale-snapshot races).
 */
export const sendEventToParent = (self: any, event: { type: string; [key: string]: any }) => {
  try {
    if (self._parent) {
      self._parent.send(event)
    }
  } catch (error) {
    console.error('Failed to send event to parent:', error)
  }
}

export const getParentContext = (self: any) => {
  try {
    return self._parent?.getSnapshot()?.context
  } catch (error) {
    console.error('Failed to access parent context:', error)
    return null
  }
} 