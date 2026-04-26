/**
 * Codex authentication service — public API.
 *
 * Manages the ChatGPT OAuth flow, token storage, and API key retrieval.
 * The exchanged API key is a standard OpenAI API key usable with the
 * Vercel AI SDK's OpenAI provider.
 */

import { runOAuthLogin, refreshTokens } from './oauth-server'
import {
  readAuthFile,
  writeAuthFile,
  deleteAuthFile,
  getStoredApiKey,
  getStoredTokens,
  getUserInfo,
  needsRefresh,
} from './token-store'
import type { UserInfo } from './token-store'

export type { UserInfo }

export interface CodexAuthStatus {
  authenticated: boolean
  email?: string
  planType?: string
  accountId?: string
  apiKeyPresent: boolean
}

/**
 * Get the current auth status without triggering a login or refresh.
 */
export function getAuthStatus(): CodexAuthStatus {
  const apiKey = getStoredApiKey()
  const info = getUserInfo()
  return {
    authenticated: !!apiKey,
    email: info.email,
    planType: info.planType,
    accountId: info.accountId,
    apiKeyPresent: !!apiKey,
  }
}

/**
 * Get the OpenAI API key, refreshing tokens if needed.
 * Returns null if not authenticated.
 */
export async function getApiKey(): Promise<string | null> {
  let apiKey = getStoredApiKey()
  if (!apiKey) return null

  // Auto-refresh if tokens are stale (>28 days)
  if (needsRefresh()) {
    try {
      await doRefresh()
      apiKey = getStoredApiKey()
    } catch {
      // Refresh failed — return existing key, it may still work
    }
  }

  return apiKey
}

/**
 * Run the interactive OAuth login flow.
 * Opens the user's browser for authentication.
 */
export async function login(
  openBrowser: (url: string) => Promise<void>,
): Promise<CodexAuthStatus> {
  await runOAuthLogin(openBrowser)
  return getAuthStatus()
}

/**
 * Clear stored tokens and API key.
 */
export function logout(): void {
  deleteAuthFile()
}

/**
 * Refresh tokens and re-exchange for a fresh API key.
 */
async function doRefresh(): Promise<void> {
  const tokens = getStoredTokens()
  if (!tokens?.refresh_token) {
    throw new Error('No refresh token available')
  }

  const newTokens = await refreshTokens(tokens.refresh_token)

  // Re-exchange for API key
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
    client_id: 'app_EMoamEEZ73f0CkXaXp7hrann',
    requested_token: 'openai-api-key',
    subject_token: newTokens.id_token,
    subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
  })

  const res = await fetch('https://auth.openai.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    throw new Error(`API key re-exchange failed (${res.status})`)
  }

  const data = await res.json() as { access_token: string }

  writeAuthFile({
    OPENAI_API_KEY: data.access_token,
    tokens: {
      id_token: newTokens.id_token,
      access_token: newTokens.access_token,
      refresh_token: newTokens.refresh_token,
    },
    last_refresh: new Date().toISOString(),
  })
}
