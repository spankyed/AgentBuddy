import { onUnmounted } from 'vue'

/**
 * Creates a debounced version of a function that delays invoking the callback
 * until after the specified delay has elapsed since the last time it was invoked.
 * 
 * @param callback - The function to debounce
 * @param delay - The delay in milliseconds (default: 500ms)
 * @returns An object with the debounced function and a cancel method
 * 
 * @example
 * ```typescript
 * const { debounced, cancel } = useDebounce(() => {
 *   console.log('Debounced!')
 * }, 1000)
 * 
 * // Call multiple times - only executes once after 1 second
 * debounced()
 * debounced()
 * debounced()
 * 
 * // Cancel pending execution
 * cancel()
 * ```
 */
export function useDebounce<T extends (...args: any[]) => any>(
  callback: T,
  delay: number = 500
): {
  debounced: T
  cancel: () => void
  flush: () => void
} {
  let timeoutId: NodeJS.Timeout | null = null
  let pendingArgs: Parameters<T> | null = null

  const cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
    pendingArgs = null
  }

  const flush = () => {
    if (timeoutId && pendingArgs) {
      clearTimeout(timeoutId)
      timeoutId = null
      const args = pendingArgs
      pendingArgs = null
      callback(...args)
    }
  }

  const debounced = ((...args: Parameters<T>) => {
    cancel()
    pendingArgs = args
    timeoutId = setTimeout(() => {
      pendingArgs = null
      callback(...args)
    }, delay)
  }) as T

  // Cancel on component unmount (don't flush — triggering state updates during
  // Vue teardown can cause child components to access destroyed resources)
  onUnmounted(() => {
    cancel()
  })

  return {
    debounced,
    cancel,
    flush
  }
}

/**
 * Alternative API that accepts a callback parameter for more flexibility.
 * Useful when you need to debounce different callbacks with the same timer.
 * 
 * @param delay - The delay in milliseconds (default: 500ms)
 * @returns A debounce function that accepts a callback
 * 
 * @example
 * ```typescript
 * const debounce = useDebounceFn(500)
 * 
 * // Use with different callbacks
 * debounce(() => saveData())
 * debounce(() => validateForm())
 * ```
 */
export function useDebounceFn(delay: number = 500): (callback: Function) => void {
  let timeoutId: NodeJS.Timeout | null = null

  const debounce = (callback: Function) => {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
    timeoutId = setTimeout(() => {
      callback()
    }, delay)
  }

  // Cleanup on component unmount
  onUnmounted(() => {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  })

  return debounce
}