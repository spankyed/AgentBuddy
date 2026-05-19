/**
 * OpenAI ChatGPT OAuth auth service.
 *
 * Provides browser-based OAuth login for ChatGPT Pro subscribers,
 * token storage/refresh, and credential access for API calls.
 * Shares token storage with Codex CLI (~/.codex/auth.json).
 */

import { login, logout } from './login'
import { getValidCredentials } from './refresh'
import { loadAuth, clearAuth } from './storage'
import type { AuthState } from './types'

export type { AuthState, AuthMode, ChatGPTTokens, IdTokenClaims } from './types'
export { OAUTH_CONFIG } from './types'
export { decodeJwtPayload } from './storage'

export const openaiAuthService = {
  /** Run the browser OAuth login flow. Returns auth state on success. */
  async login(): Promise<AuthState> {
    return login()
  },

  /** Revoke tokens and clear stored auth. */
  async logout(): Promise<void> {
    const state = await loadAuth()
    const refreshToken = state?.mode === 'chatgpt' ? state.tokens?.refreshToken : undefined
    await logout(refreshToken)
  },

  /**
   * Get valid credentials, auto-refreshing if needed.
   * Returns null if not authenticated via ChatGPT OAuth.
   */
  async getCredentials(): Promise<{ accessToken: string; accountId: string } | null> {
    return getValidCredentials()
  },

  /** Load current auth state from storage. */
  async status(): Promise<AuthState | null> {
    return loadAuth()
  },

  /** Check if the user is authenticated (ChatGPT OAuth or API key). */
  async isAuthenticated(): Promise<boolean> {
    const state = await loadAuth()
    if (!state) return false
    if (state.mode === 'chatgpt' && state.tokens?.accessToken) return true
    if (state.mode === 'api-key' && state.apiKey) return true
    return false
  },

  /** Clear stored auth without revoking tokens. */
  async clearAuth(): Promise<void> {
    await clearAuth()
  },
}
