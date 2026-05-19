/**
 * Token refresh — refresh ChatGPT OAuth tokens before expiry.
 *
 * Calls POST /oauth/token with grant_type=refresh_token.
 * Matches Codex CLI's token refresh logic.
 */

import { OAUTH_CONFIG, type ChatGPTTokens } from './types'
import { decodeJwtPayload, saveAuth, loadAuth } from './storage'
import { createLogger } from '@/core/helpers/debug/logger'

const logger = createLogger('openai-auth-refresh')

/** Check if an id_token JWT is expired (or will expire within skewMs). */
export function isTokenExpired(idToken: string, skewMs = OAUTH_CONFIG.refreshSkewMs): boolean {
  if (!idToken) return true // Empty token — force refresh
  try {
    const claims = decodeJwtPayload(idToken)
    if (!claims.exp) return true // No expiry claim — force refresh to be safe
    const expiresAt = claims.exp * 1000 // Convert seconds to ms
    return Date.now() + skewMs >= expiresAt
  } catch {
    return true // Can't decode — treat as expired
  }
}

/** Refresh tokens using the refresh_token grant. */
export async function refreshTokens(currentRefreshToken: string): Promise<ChatGPTTokens> {
  const response = await fetch(`${OAUTH_CONFIG.issuer}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: OAUTH_CONFIG.clientId,
      grant_type: 'refresh_token',
      refresh_token: currentRefreshToken,
    }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Token refresh failed (${response.status}): ${text.slice(0, 500)}`)
  }

  const data = await response.json() as Record<string, unknown>
  const idToken = (data.id_token as string) ?? ''
  const accessToken = (data.access_token as string) ?? ''
  const refreshToken = (data.refresh_token as string) || currentRefreshToken

  if (!accessToken) {
    throw new Error('Token refresh returned empty access_token')
  }

  // Extract account ID from id_token claims
  const claims = decodeJwtPayload(idToken)
  const accountId = claims.chatgpt_account_id ?? ''

  const tokens: ChatGPTTokens = { idToken, accessToken, refreshToken, accountId }

  // Persist refreshed tokens
  await saveAuth({
    mode: 'chatgpt',
    tokens,
    lastRefresh: new Date().toISOString(),
  })

  logger.debug('Tokens refreshed successfully')
  return tokens
}

/**
 * Get valid credentials, refreshing if needed.
 * Returns null if not authenticated or refresh fails permanently.
 */
export async function getValidCredentials(): Promise<{ accessToken: string; accountId: string } | null> {
  const state = await loadAuth()
  if (!state || state.mode !== 'chatgpt' || !state.tokens) return null

  let { tokens } = state

  // Check if token needs refresh
  if (isTokenExpired(tokens.idToken)) {
    try {
      tokens = await refreshTokens(tokens.refreshToken)
    } catch (err) {
      logger.error('Token refresh failed', { error: err })
      return null
    }
  }

  return { accessToken: tokens.accessToken, accountId: tokens.accountId }
}
