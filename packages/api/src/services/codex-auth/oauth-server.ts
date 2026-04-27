/**
 * Local OAuth server for ChatGPT authentication.
 *
 * Implements OAuth 2.0 Authorization Code + PKCE flow against
 * `auth.openai.com`, replicating the Codex CLI login flow:
 *
 *  1. Spin up a localhost HTTP server on port 1455 (fallback to random)
 *  2. Open the user's browser to the authorize URL
 *  3. Receive the callback with `code` + `state`
 *  4. Exchange code for tokens (id_token, access_token, refresh_token)
 *  5. Exchange id_token for an OpenAI API key via token-exchange grant
 *  6. Persist everything to `~/.codex/auth.json`
 */

import http from 'http'
import crypto from 'crypto'
import { writeAuthFile } from './token-store'

// ─── Constants (from Codex source) ──────────────────────────────────────────

const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
const AUTH_BASE = 'https://auth.openai.com'
const AUTHORIZE_URL = `${AUTH_BASE}/oauth/authorize`
const TOKEN_URL = `${AUTH_BASE}/oauth/token`
const DEFAULT_PORT = 1455
const SCOPES = 'openid profile email offline_access'

// ─── PKCE helpers ───────────────────────────────────────────────────────────

function base64url(buf: Buffer): string {
  return buf.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function generateCodeVerifier(): string {
  return base64url(crypto.randomBytes(64))
}

function generateCodeChallenge(verifier: string): string {
  const hash = crypto.createHash('sha256').update(verifier).digest()
  return base64url(hash)
}

function generateState(): string {
  return base64url(crypto.randomBytes(32))
}

// ─── Token exchange helpers ─────────────────────────────────────────────────

async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
  codeVerifier: string,
): Promise<{ id_token: string; access_token: string; refresh_token: string }> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: CLIENT_ID,
    code_verifier: codeVerifier,
  })

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Token exchange failed (${res.status}): ${text}`)
  }

  return res.json() as Promise<{ id_token: string; access_token: string; refresh_token: string }>
}

async function exchangeTokenForApiKey(idToken: string): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
    client_id: CLIENT_ID,
    requested_token: 'openai-api-key',
    subject_token: idToken,
    subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
  })

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API key exchange failed (${res.status}): ${text}`)
  }

  const data = await res.json() as { access_token: string }
  return data.access_token
}

// ─── Refresh ────────────────────────────────────────────────────────────────

export async function refreshTokens(refreshToken: string): Promise<{
  id_token: string
  access_token: string
  refresh_token: string
}> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: 'openid profile email',
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Token refresh failed (${res.status}): ${text}`)
  }

  return res.json() as Promise<{ id_token: string; access_token: string; refresh_token: string }>
}

// ─── Success HTML ───────────────────────────────────────────────────────────

const SUCCESS_HTML = `<!DOCTYPE html>
<html><head><title>Codex Login</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; display: flex;
         align-items: center; justify-content: center; min-height: 100vh;
         margin: 0; background: #0a0a0a; color: #fafafa; }
  .card { text-align: center; padding: 2rem; }
  h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
  p { color: #888; }
</style></head>
<body><div class="card">
  <h1>Authenticated</h1>
  <p>You can close this tab and return to the app.</p>
</div></body></html>`

// ─── Main login flow ────────────────────────────────────────────────────────

export interface LoginResult {
  apiKey?: string
  email?: string
  planType?: string
}

/**
 * Run the full ChatGPT OAuth login flow.
 *
 * 1. Starts a local server
 * 2. Opens the browser to the authorize URL
 * 3. Waits for the callback
 * 4. Exchanges code for tokens + API key
 * 5. Persists to `~/.codex/auth.json`
 *
 * @param openBrowser - Function to open a URL in the browser (injected so
 *   Electron can use `shell.openExternal` and tests can mock it).
 */
export async function runOAuthLogin(
  openBrowser: (url: string) => Promise<void>,
): Promise<LoginResult> {
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = generateCodeChallenge(codeVerifier)
  const state = generateState()

  // ── Start local server ──────────────────────────────────────────────
  return new Promise<LoginResult>((resolve, reject) => {
    const server = http.createServer()
    let resolved = false

    // Auto-close after 5 minutes
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true
        server.close()
        reject(new Error('Login timed out after 5 minutes'))
      }
    }, 5 * 60 * 1000)

    server.on('request', async (req, res) => {
      const url = new URL(req.url ?? '/', `http://localhost`)

      if (url.pathname === '/auth/callback') {
        const code = url.searchParams.get('code')
        const returnedState = url.searchParams.get('state')

        if (!code || returnedState !== state) {
          res.writeHead(400, { 'Content-Type': 'text/plain' })
          res.end('Invalid callback parameters')
          return
        }

        // Show success page immediately
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(SUCCESS_HTML)

        try {
          const port = (server.address() as any)?.port ?? DEFAULT_PORT
          const redirectUri = `http://localhost:${port}/auth/callback`

          // Exchange code for tokens
          const tokens = await exchangeCodeForTokens(code, redirectUri, codeVerifier)

          // Exchange id_token for API key — non-fatal if it fails (matches Codex Rust behavior).
          // Some accounts (e.g., without platform organization) fail with "missing organization_id".
          // In that case, the access_token is used directly as the bearer token.
          let apiKey: string | undefined
          try {
            apiKey = await exchangeTokenForApiKey(tokens.id_token)
          } catch {
            // API key exchange failed — not fatal, access_token will be used as fallback
          }

          // Persist
          writeAuthFile({
            ...(apiKey && { OPENAI_API_KEY: apiKey }),
            tokens: {
              id_token: tokens.id_token,
              access_token: tokens.access_token,
              refresh_token: tokens.refresh_token,
            },
            last_refresh: new Date().toISOString(),
          })

          // Parse email from id_token
          const payload = JSON.parse(
            Buffer.from(tokens.id_token.split('.')[1]
              .replace(/-/g, '+').replace(/_/g, '/') + '==', 'base64')
              .toString('utf-8')
          )

          resolved = true
          clearTimeout(timeout)
          server.close()

          resolve({
            ...(apiKey && { apiKey }),
            email: payload.email,
            planType: payload['https://api.openai.com/auth.chatgpt_plan_type'],
          })
        } catch (err) {
          if (!resolved) {
            resolved = true
            clearTimeout(timeout)
            server.close()
            reject(err)
          }
        }
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' })
        res.end('Not found')
      }
    })

    server.listen(DEFAULT_PORT, '127.0.0.1', () => {
      const addr = server.address() as { port: number }
      const port = addr.port
      const redirectUri = `http://localhost:${port}/auth/callback`

      const params = new URLSearchParams({
        response_type: 'code',
        client_id: CLIENT_ID,
        redirect_uri: redirectUri,
        scope: SCOPES,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        id_token_add_organizations: 'true',
        codex_cli_simplified_flow: 'true',
        state,
      })

      const authorizeUrl = `${AUTHORIZE_URL}?${params.toString()}`
      openBrowser(authorizeUrl).catch(err => {
        if (!resolved) {
          resolved = true
          clearTimeout(timeout)
          server.close()
          reject(new Error(`Failed to open browser: ${err.message}`))
        }
      })
    })

    // Fallback: if the default port is taken, try a random one (once)
    let retried = false
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' && !retried && !resolved) {
        retried = true
        server.listen(0, '127.0.0.1')
      } else if (!resolved) {
        resolved = true
        clearTimeout(timeout)
        reject(err)
      }
    })
  })
}
