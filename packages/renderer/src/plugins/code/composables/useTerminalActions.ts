import { type Ref } from 'vue'
import type { ActorRefFrom } from 'xstate'
import type { TerminalInfo } from '../features/terminal/state'
import type { terminalState } from '../features/terminal/state'

type TerminalActor = ActorRefFrom<typeof terminalState>

export interface TerminalCloseOptions {
  /**
   * If true, skips the confirmation dialog even if confirmTerminalClose is enabled.
   * Useful for programmatic closes where confirmation was already handled.
   */
  skipConfirmation?: boolean
}

/**
 * Composable for terminal operations with centralized logic.
 * Handles confirmation dialogs and terminal process management according to settings.
 */
export function useTerminalActions(
  terminalActor: TerminalActor | undefined,
  confirmTerminalClose: Ref<boolean>,
  closeTerminalOnTabClose: Ref<boolean>
) {
  /**
   * Gets the display name for a terminal.
   * Priority: customTitle > cwd basename > title
   */
  const getTerminalDisplayName = (terminalInfo: TerminalInfo): string => {
    if (terminalInfo.customTitle) {
      return terminalInfo.customTitle
    }
    // Use the last part of the cwd path as the display name
    return terminalInfo.cwd.split('/').filter(Boolean).pop() || terminalInfo.title
  }

  /**
   * Closes a terminal with proper confirmation and settings handling.
   *
   * @param terminalInfo - The terminal to close
   * @param options - Optional configuration
   * @returns true if terminal was closed, false if cancelled
   */
  const closeTerminal = (
    terminalInfo: TerminalInfo,
    options: TerminalCloseOptions = {}
  ): boolean => {
    const { skipConfirmation = false } = options

    // Show confirmation dialog if setting is enabled and not skipped
    if (!skipConfirmation && confirmTerminalClose.value) {
      const displayName = getTerminalDisplayName(terminalInfo)
      if (!confirm(`Close terminal "${displayName}"?`)) {
        return false // User cancelled
      }
    }

    // Only send close event if setting is enabled
    if (closeTerminalOnTabClose.value) {
      terminalActor?.send({ type: 'terminal.CLOSE', terminalId: terminalInfo.id })
    }

    return true // Terminal was closed (or will be closed)
  }

  return {
    closeTerminal,
    getTerminalDisplayName
  }
}
