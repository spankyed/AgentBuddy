# ChatGPT Subscription OAuth — Standalone Implementation Guide

How to authenticate with OpenAI's Codex API using a ChatGPT Plus/Pro subscription, without the opencode SDK wrapper. Everything below is extracted from `opencode/packages/opencode/src/plugin/codex.ts`.

---

## Constants

```
Client ID:        app_EMoamEEZ73f0CkXaXp7hrann
Auth Server:      https://auth.openai.com
Codex API:        https://chatgpt.com/backend-api/codex/responses
Local OAuth Port: 1455
Redirect URI:     http://localhost:1455/auth/callback
```

## Allowed Models (OAuth only)

```
gpt-5.1-codex
gpt-5.1-codex-max
gpt-5.1-codex-mini
gpt-5.2
gpt-5.2-codex
gpt-5.3-codex
gpt-5.4
gpt-5.4-mini
```

All cost $0 — included with your ChatGPT subscription.

---

## Step 1: PKCE Setup

Generate a code verifier and challenge before starting the OAuth flow.

```typescript
// Code verifier: 43 random characters from this set
const CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"

function generateVerifier(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(43))
  return Array.from(bytes).map(b => CHARSET[b % CHARSET.length]).join("")
}

// Code challenge: SHA-256 hash of verifier, base64url encoded
async function generateChallenge(verifier: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))
  const binary = String.fromCharCode(...new Uint8Array(hash))
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

// State: 32 random bytes, base64url encoded
function generateState(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)).buffer)
}
```

---

## Step 2a: Browser Flow (PKCE + Local Callback)

### Build the authorization URL

```
GET https://auth.openai.com/oauth/authorize
  ?response_type=code
  &client_id=app_EMoamEEZ73f0CkXaXp7hrann
  &redirect_uri=http://localhost:1455/auth/callback
  &scope=openid profile email offline_access
  &code_challenge={challenge}
  &code_challenge_method=S256
  &id_token_add_organizations=true
  &codex_cli_simplified_flow=true
  &state={state}
  &originator=opencode
```

### Start a local HTTP server on port 1455

Listen for the callback at `/auth/callback`. Extract:
- `code` query param (authorization code)
- `state` query param (verify it matches what you sent)

On error, check the `error` and `error_description` query params.

### Exchange the code for tokens

```
POST https://auth.openai.com/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code={authorization_code}
&redirect_uri=http://localhost:1455/auth/callback
&client_id=app_EMoamEEZ73f0CkXaXp7hrann
&code_verifier={verifier}
```

**Response:**
```json
{
  "id_token": "<jwt>",
  "access_token": "<jwt>",
  "refresh_token": "<string>",
  "expires_in": 3600
}
```

---

## Step 2b: Device/Headless Flow (Alternative)

Use this when there's no browser (SSH, containers, etc).

### Initiate device authorization

```
POST https://auth.openai.com/api/accounts/deviceauth/usercode
Content-Type: application/json
User-Agent: your-app/1.0

{ "client_id": "app_EMoamEEZ73f0CkXaXp7hrann" }
```

**Response:**
```json
{
  "device_auth_id": "<string>",
  "user_code": "<string>",
  "interval": "5"
}
```

Display the `user_code` and direct the user to `https://auth.openai.com/codex/device`.

### Poll for completion

```
POST https://auth.openai.com/api/accounts/deviceauth/token
Content-Type: application/json
User-Agent: your-app/1.0

{
  "device_auth_id": "{device_auth_id}",
  "user_code": "{user_code}"
}
```

- Poll every `interval` seconds + 3s safety margin
- **403/404** = user hasn't authorized yet, keep polling
- **Other non-200** = failure, stop
- **200** = success

**Success response:**
```json
{
  "authorization_code": "<string>",
  "code_verifier": "<string>"
}
```

### Exchange the device code for tokens

```
POST https://auth.openai.com/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code={authorization_code}
&redirect_uri=https://auth.openai.com/deviceauth/callback
&client_id=app_EMoamEEZ73f0CkXaXp7hrann
&code_verifier={code_verifier}
```

Note: the `redirect_uri` here is OpenAI's own callback, not localhost. The `code_verifier` comes from the poll response, not from your own PKCE.

**Response:** Same token response as the browser flow.

---

## Step 3: Extract Account ID from JWT

Parse the `id_token` (or `access_token`) JWT to get the ChatGPT account ID. This is needed for org/team subscriptions.

```typescript
function extractAccountId(tokens: TokenResponse): string | undefined {
  for (const jwt of [tokens.id_token, tokens.access_token]) {
    if (!jwt) continue
    const payload = JSON.parse(
      Buffer.from(jwt.split(".")[1], "base64url").toString()
    )
    const id =
      payload.chatgpt_account_id ??
      payload["https://api.openai.com/auth"]?.chatgpt_account_id ??
      payload.organizations?.[0]?.id
    if (id) return id
  }
  return undefined
}
```

---

## Step 4: Store Credentials

Save these values however you like. Opencode uses a JSON file with `0o600` permissions:

```json
{
  "refresh": "<refresh_token>",
  "access": "<access_token>",
  "expires": 1713000000000,
  "accountId": "<chatgpt_account_id>"
}
```

`expires` = `Date.now() + (expires_in ?? 3600) * 1000`

---

## Step 5: Refresh Tokens

Before each API call, check if the access token is expired. If so:

```
POST https://auth.openai.com/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
&refresh_token={refresh_token}
&client_id=app_EMoamEEZ73f0CkXaXp7hrann
```

**Response:** Same token format. Update your stored `access`, `refresh`, `expires`, and re-extract `accountId`.

---

## Step 6: Call the Codex API

This is the key part — you call a different endpoint than the normal OpenAI API.

### Endpoint

```
POST https://chatgpt.com/backend-api/codex/responses
```

**NOT** `api.openai.com`. The subscription-based endpoint lives on `chatgpt.com`.

### Required Headers

```
Authorization: Bearer {access_token}
Content-Type: application/json
originator: opencode
User-Agent: your-app/1.0 (darwin 25.3.0; arm64)
session_id: {your_session_id}
```

If you have an `accountId` (org/team subscriptions):
```
ChatGPT-Account-Id: {accountId}
```

### Request Body

The request body follows the OpenAI Responses API format:

```json
{
  "model": "gpt-5.1-codex",
  "input": "your prompt here",
  "instructions": "system prompt (optional)"
}
```

### Important: maxOutputTokens

Set `max_output_tokens` to `null`/`undefined` (omit it). This matches Codex CLI behavior.

---

## What OpenCode's SDK Hijacking Does (So You Don't Have To)

OpenCode uses the **Vercel AI SDK** to talk to providers:

- **`ai`** — core SDK (streaming, tool calls, message formatting)
- **`@ai-sdk/openai`** — OpenAI provider, created via `createOpenAI()`

The hijacking works because `createOpenAI` accepts a custom `fetch` option:

```typescript
import { createOpenAI } from "@ai-sdk/openai"

const provider = createOpenAI({
  apiKey: "opencode-oauth-dummy-key",  // dummy so SDK doesn't error
  fetch: customFetchThatDoesTheRealAuth,
})
```

If you want to use the same SDK approach: `npm install ai @ai-sdk/openai`

Here's what the custom fetch does (which you can skip if calling the API directly):

1. **Dummy API key** — Feeds the SDK `"opencode-oauth-dummy-key"` so it doesn't error on initialization. You don't need this since you're not using the SDK.

2. **Strip + replace auth header** — The SDK sets `Authorization: Bearer opencode-oauth-dummy-key`. The custom fetch strips it and replaces with the real OAuth token. You just set the right header from the start.

3. **URL rewrite** — The SDK targets `api.openai.com/v1/responses`. The custom fetch rewrites this to `chatgpt.com/backend-api/codex/responses`. You just call the right URL directly.

4. **Token refresh in fetch** — Checks expiry and refreshes before each call. You handle this in your own request logic.

5. **Model filtering** — Removes non-Codex models from the provider. You just use the allowed models list above.

6. **Cost zeroing** — Sets all costs to 0. Cosmetic only.

None of this indirection is needed when you own the HTTP layer.

---

## Minimal Working Example

```typescript
const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann"
const CODEX_API = "https://chatgpt.com/backend-api/codex/responses"

// After completing OAuth and storing tokens...

async function callCodex(prompt: string, model = "gpt-5.1-codex") {
  // Refresh token if needed
  if (credentials.expires < Date.now()) {
    const res = await fetch("https://auth.openai.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: credentials.refresh,
        client_id: CLIENT_ID,
      }),
    })
    const tokens = await res.json()
    credentials.access = tokens.access_token
    credentials.refresh = tokens.refresh_token
    credentials.expires = Date.now() + (tokens.expires_in ?? 3600) * 1000
  }

  // Call the Codex API
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${credentials.access}`,
    "Content-Type": "application/json",
    "originator": "opencode",
    "User-Agent": "my-app/1.0",
  }
  if (credentials.accountId) {
    headers["ChatGPT-Account-Id"] = credentials.accountId
  }

  const res = await fetch(CODEX_API, {
    method: "POST",
    headers,
    body: JSON.stringify({ model, input: prompt }),
  })

  return res.json()
}
```
