/**
 * Token storage — read/write ~/.codex/auth.json.
 *
 * Shares Codex's token storage so both apps can coexist. The file format
 * matches Codex CLI's AuthDotJson with field name mapping.
 */

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import type { AuthState, IdTokenClaims } from './types'

function codexHome(): string {
  return process.env.CODEX_HOME || path.join(os.homedir(), '.codex')
}

export function authFilePath(): string {
  return path.join(codexHome(), 'auth.json')
}

/** Decode a JWT payload without verifying the signature. */
export function decodeJwtPayload(jwt: string): IdTokenClaims {
  const parts = jwt.split('.')
  if (parts.length !== 3) return {}
  const payload = Buffer.from(parts[1], 'base64url').toString('utf8')
  return JSON.parse(payload) as IdTokenClaims
}

/** Load auth state from ~/.codex/auth.json. Returns null if not found. */
export async function loadAuth(): Promise<AuthState | null> {
  try {
    const raw = await fs.promises.readFile(authFilePath(), 'utf8')
    const data = JSON.parse(raw) as Record<string, unknown>

    // Codex stores auth_mode as a string
    const authMode = data.auth_mode as string | undefined

    if (authMode?.toLowerCase() === 'chatgpt') {
      const tokens = data.tokens as Record<string, unknown> | undefined
      if (!tokens?.access_token) return null

      return {
        mode: 'chatgpt',
        tokens: {
          idToken: (tokens.id_token as string) ?? '',
          accessToken: tokens.access_token as string,
          refreshToken: (tokens.refresh_token as string) ?? '',
          accountId: (tokens.account_id as string) ?? '',
        },
        lastRefresh: data.last_refresh as string | undefined,
      }
    }

    // API key mode
    const apiKey = data.OPENAI_API_KEY as string | undefined
    if (apiKey) {
      return { mode: 'api-key', apiKey }
    }

    return null
  } catch {
    return null
  }
}

/** Save auth state to ~/.codex/auth.json. Creates the directory if needed. */
export async function saveAuth(state: AuthState): Promise<void> {
  const dir = codexHome()
  await fs.promises.mkdir(dir, { recursive: true })

  let data: Record<string, unknown>

  if (state.mode === 'chatgpt' && state.tokens) {
    data = {
      auth_mode: 'chatgpt',
      OPENAI_API_KEY: null,
      tokens: {
        id_token: state.tokens.idToken,
        access_token: state.tokens.accessToken,
        refresh_token: state.tokens.refreshToken,
        account_id: state.tokens.accountId,
      },
      last_refresh: state.lastRefresh ?? new Date().toISOString(),
    }
  } else {
    data = {
      auth_mode: 'api_key',
      OPENAI_API_KEY: state.apiKey ?? null,
      tokens: null,
      last_refresh: null,
    }
  }

  const file = authFilePath()
  await fs.promises.writeFile(file, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 })
}

/** Delete ~/.codex/auth.json. Idempotent. */
export async function clearAuth(): Promise<void> {
  await fs.promises.rm(authFilePath(), { force: true })
}
