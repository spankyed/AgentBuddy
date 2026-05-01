/**
 * Token persistence for Codex ChatGPT OAuth.
 *
 * Stores tokens in `~/.codex/auth.json` (same location as Codex CLI) with
 * restricted file permissions (0o600). Parses JWT claims from id_token to
 * extract user info (email, plan type, account ID).
 */

import fs from 'fs'
import path from 'path'
import os from 'os'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TokenData {
  id_token: string
  access_token: string
  refresh_token: string
}

export interface AuthFile {
  OPENAI_API_KEY?: string
  tokens?: TokenData
  last_refresh?: string
}

export interface UserInfo {
  email?: string
  planType?: string
  accountId?: string
}

// ─── Paths ──────────────────────────────────────────────────────────────────

const CODEX_HOME = process.env.CODEX_HOME || path.join(os.homedir(), '.codex')
const AUTH_FILE = path.join(CODEX_HOME, 'auth.json')

// ─── JWT parsing (no dependency — just base64url decode) ────────────────────

function decodeJwtPayload(jwt: string): Record<string, any> {
  const parts = jwt.split('.')
  if (parts.length < 2) return {}
  const payload = parts[1]
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const padded = payload + '='.repeat((4 - payload.length % 4) % 4)
  try {
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf-8'))
  } catch {
    return {}
  }
}

// ─── Read / Write ─────────────────────────────────────���─────────────────────

export function readAuthFile(): AuthFile | null {
  try {
    const raw = fs.readFileSync(AUTH_FILE, 'utf-8')
    return JSON.parse(raw) as AuthFile
  } catch {
    return null
  }
}

export function writeAuthFile(data: AuthFile): void {
  fs.mkdirSync(CODEX_HOME, { recursive: true })
  fs.writeFileSync(AUTH_FILE, JSON.stringify(data, null, 2), { mode: 0o600 })
}

export function deleteAuthFile(): void {
  try {
    fs.unlinkSync(AUTH_FILE)
  } catch { /* ignore */ }
}

// ─── Accessors ──────────────────────────────────────────────────────────────

export function getStoredApiKey(): string | null {
  const data = readAuthFile()
  // Prefer the exchanged API key; fall back to the OAuth access_token
  // (matches Codex Rust behavior — API key exchange is optional)
  return data?.OPENAI_API_KEY ?? data?.tokens?.access_token ?? null
}

/**
 * Returns true when authenticating via ChatGPT OAuth (no exchanged API key).
 * ChatGPT tokens require a different base URL and extra headers.
 */
export function isChatGptAuth(): boolean {
  const data = readAuthFile()
  // If we have an exchanged API key, we use the standard API endpoint.
  // If we only have the OAuth access_token, we're in ChatGPT mode.
  return !data?.OPENAI_API_KEY && !!data?.tokens?.access_token
}

/**
 * Get the chatgpt_account_id from the id_token claims (needed as a header).
 */
export function getAccountId(): string | undefined {
  const tokens = getStoredTokens()
  if (!tokens?.id_token) return undefined
  const claims = decodeJwtPayload(tokens.id_token)
  // Codex extracts from nested 'https://api.openai.com/auth' object
  const authClaims = claims['https://api.openai.com/auth']
  if (authClaims && typeof authClaims === 'object') {
    return authClaims.chatgpt_account_id
  }
  return claims['https://api.openai.com/auth.chatgpt_account_id']
}

export function getStoredTokens(): TokenData | null {
  const data = readAuthFile()
  return data?.tokens ?? null
}

export function getLastRefresh(): Date | null {
  const data = readAuthFile()
  if (!data?.last_refresh) return null
  const d = new Date(data.last_refresh)
  return isNaN(d.getTime()) ? null : d
}

export function getUserInfo(): UserInfo {
  const tokens = getStoredTokens()
  if (!tokens?.id_token) return {}
  const claims = decodeJwtPayload(tokens.id_token)
  return {
    email: claims.email,
    planType: claims['https://api.openai.com/auth.chatgpt_plan_type'],
    accountId: claims['https://api.openai.com/auth.chatgpt_account_id'],
  }
}

export function needsRefresh(): boolean {
  const last = getLastRefresh()
  if (!last) return true
  const days = (Date.now() - last.getTime()) / (1000 * 60 * 60 * 24)
  return days > 28
}
