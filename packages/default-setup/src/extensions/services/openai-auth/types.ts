/**
 * Type definitions for the OpenAI ChatGPT OAuth auth service.
 *
 * Mirrors the auth flow used by Codex CLI — browser OAuth with PKCE
 * to auth.openai.com, storing tokens in ~/.codex/auth.json.
 */

export type AuthMode = 'chatgpt' | 'api-key'

export interface ChatGPTTokens {
  /** JWT with claims (plan type, account ID, email, etc.) */
  idToken: string
  /** Bearer token for API requests. */
  accessToken: string
  /** For token refresh when access_token expires. */
  refreshToken: string
  /** ChatGPT account/workspace ID (from JWT claims). Used as ChatGPT-Account-ID header. */
  accountId: string
}

export interface AuthState {
  mode: AuthMode
  /** Present when mode === 'chatgpt'. */
  tokens?: ChatGPTTokens
  /** Present when mode === 'api-key'. */
  apiKey?: string
  /** ISO timestamp of last token refresh. */
  lastRefresh?: string
}

/** Claims extracted from the id_token JWT. */
export interface IdTokenClaims {
  chatgpt_account_id?: string
  chatgpt_user_id?: string
  email?: string
  chatgpt_plan_type?: string
  chatgpt_account_is_fedramp?: boolean
  exp?: number
  iat?: number
  [key: string]: unknown
}

/** OAuth configuration constants matching Codex CLI. */
export const OAUTH_CONFIG = {
  issuer: 'https://auth.openai.com',
  clientId: 'app_EMoamEEZ73f0CkXaXp7hrann',
  scopes: [
    'openid',
    'profile',
    'email',
    'offline_access',
    'api.connectors.read',
    'api.connectors.invoke',
  ],
  callbackPort: 1455,
  fallbackPort: 1457,
  callbackPath: '/auth/callback',
  /** Refresh tokens 30 seconds before expiry. */
  refreshSkewMs: 30_000,
} as const
