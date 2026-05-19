/**
 * Browser OAuth login flow — spawns a local callback server, opens the
 * browser for OpenAI auth, handles the callback, exchanges the code for tokens.
 *
 * Matches Codex CLI's login flow:
 * 1. Generate PKCE verifier/challenge + state
 * 2. Start local HTTP server on localhost:1455
 * 3. Build authorization URL
 * 4. Open browser
 * 5. Wait for callback with code
 * 6. Exchange code for tokens at /oauth/token
 * 7. Save to ~/.codex/auth.json
 */

import * as http from 'http'
import { exec } from 'child_process'
import { OAUTH_CONFIG, type AuthState, type ChatGPTTokens } from './types'
import { generateVerifier, generateChallenge, generateState } from './pkce'
import { decodeJwtPayload, saveAuth, clearAuth } from './storage'
import { createLogger } from '@/core/helpers/debug/logger'

const logger = createLogger('openai-auth-login')

/** Open a URL in the default browser. */
function openBrowser(url: string): void {
  const cmd = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'start'
    : 'xdg-open'
  exec(`${cmd} "${url}"`, err => {
    if (err) logger.warn('Failed to open browser', { error: err.message })
  })
}

/** Build the full authorization URL. */
function buildAuthUrl(verifier: string, state: string, port: number): string {
  const challenge = generateChallenge(verifier)
  const redirectUri = `http://localhost:${port}${OAUTH_CONFIG.callbackPath}`

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: OAUTH_CONFIG.clientId,
    redirect_uri: redirectUri,
    scope: OAUTH_CONFIG.scopes.join(' '),
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    id_token_add_organizations: 'true',
    codex_cli_simplified_flow: 'true',
  })

  return `${OAUTH_CONFIG.issuer}/oauth/authorize?${params.toString()}`
}

/** Exchange the authorization code for tokens. */
async function exchangeCode(code: string, verifier: string, port: number): Promise<ChatGPTTokens> {
  const redirectUri = `http://localhost:${port}${OAUTH_CONFIG.callbackPath}`

  const response = await fetch(`${OAUTH_CONFIG.issuer}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: OAUTH_CONFIG.clientId,
      code_verifier: verifier,
    }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Token exchange failed (${response.status}): ${text.slice(0, 500)}`)
  }

  const data = await response.json() as Record<string, unknown>
  const idToken = (data.id_token as string) ?? ''
  const accessToken = (data.access_token as string) ?? ''
  const refreshToken = (data.refresh_token as string) ?? ''

  const claims = decodeJwtPayload(idToken)
  const accountId = claims.chatgpt_account_id ?? ''

  return { idToken, accessToken, refreshToken, accountId }
}

/**
 * Start the local callback server and wait for the OAuth callback.
 * Returns the authorization code from the callback URL.
 */
function waitForCallback(port: number, expectedState: string): Promise<{ code: string; server: http.Server }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || '/', `http://localhost:${port}`)

      if (url.pathname !== OAUTH_CONFIG.callbackPath) {
        res.writeHead(404)
        res.end('Not found')
        return
      }

      const code = url.searchParams.get('code')
      const state = url.searchParams.get('state')
      const error = url.searchParams.get('error')

      if (error) {
        const desc = url.searchParams.get('error_description') || error
        const safeDesc = desc
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(`<html><body><h2>Login failed</h2><p>${safeDesc}</p><p>You can close this tab.</p></body></html>`)
        server.close()
        reject(new Error(`OAuth error: ${desc}`))
        return
      }

      if (!code || state !== expectedState) {
        res.writeHead(400)
        res.end('Invalid callback — state mismatch or missing code.')
        server.close()
        reject(new Error('Invalid OAuth callback: state mismatch or missing code'))
        return
      }

      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end('<html><body><h2>Login successful!</h2><p>You can close this tab and return to the app.</p></body></html>')

      clearTimeout(timer)
      resolve({ code, server })
    })

    server.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timer)
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`Port ${port} is in use — cannot start OAuth callback server`))
      } else {
        reject(err)
      }
    })

    server.listen(port, '127.0.0.1', () => {
      logger.debug(`OAuth callback server listening on localhost:${port}`)
    })

    // Timeout after 5 minutes
    const timer = setTimeout(() => {
      server.close()
      reject(new Error('Login timed out — no callback received within 5 minutes'))
    }, 5 * 60 * 1000)
  })
}

/**
 * Run the full browser OAuth login flow.
 *
 * Spawns a local callback server, opens the browser, waits for the callback,
 * exchanges the code for tokens, saves them, and returns the auth state.
 */
export async function login(): Promise<AuthState> {
  const verifier = generateVerifier()
  const state = generateState()
  const port = OAUTH_CONFIG.callbackPort

  // Start callback server and open browser
  const callbackPromise = waitForCallback(port, state)
  const authUrl = buildAuthUrl(verifier, state, port)

  logger.info('Opening browser for OpenAI login...')
  openBrowser(authUrl)

  // Wait for the callback
  const { code, server } = await callbackPromise

  try {
    // Exchange code for tokens
    const tokens = await exchangeCode(code, verifier, port)

    const authState: AuthState = {
      mode: 'chatgpt',
      tokens,
      lastRefresh: new Date().toISOString(),
    }

    await saveAuth(authState)
    logger.info('Login successful', { accountId: tokens.accountId })

    return authState
  } finally {
    server.close()
  }
}

/**
 * Revoke tokens and clear stored auth.
 */
export async function logout(refreshToken?: string): Promise<void> {
  if (refreshToken) {
    try {
      await fetch(`${OAUTH_CONFIG.issuer}/oauth/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: OAUTH_CONFIG.clientId,
          token: refreshToken,
        }),
      })
    } catch (err) {
      logger.warn('Token revocation failed (proceeding with local logout)', { error: err })
    }
  }

  await clearAuth()
  logger.info('Logged out')
}
