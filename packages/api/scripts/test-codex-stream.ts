/**
 * Debug script: test the Codex Responses API with stored tokens.
 *
 * Run: npx tsx packages/api/scripts/test-codex-stream.ts
 */

import fs from 'fs'
import path from 'path'
import os from 'os'

const AUTH_FILE = path.join(os.homedir(), '.codex', 'auth.json')

function readAuth() {
  const raw = fs.readFileSync(AUTH_FILE, 'utf-8')
  return JSON.parse(raw)
}

function decodeJwt(jwt: string) {
  const payload = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
  return JSON.parse(Buffer.from(payload + '==', 'base64').toString())
}

async function testUrl(url: string, payload: any, headers: Record<string, string>): Promise<void> {
  console.log(`\n--- ${url} ---`)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })
    console.log(`Status: ${res.status}`)
    if (!res.ok) {
      const body = await res.text()
      console.log(`Error: ${body}`)
    } else {
      console.log('SUCCESS! Reading first events...')
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let count = 0
      while (count < 5) {
        const { done, value } = await reader.read()
        if (done) break
        const text = decoder.decode(value, { stream: true })
        for (const line of text.split('\n')) {
          if (line.startsWith('data: ') && line.slice(6) !== '[DONE]') {
            try {
              const ev = JSON.parse(line.slice(6))
              count++
              console.log(`  Event: ${ev.type} ${ev.delta || ''}`)
            } catch {}
          }
        }
      }
      reader.cancel()
    }
  } catch (err: any) {
    console.log(`Fetch error: ${err.message}`)
  }
}

async function main() {
  const auth = readAuth()
  const accessToken = auth.OPENAI_API_KEY || auth.tokens?.access_token

  let accountId: string | undefined
  if (auth.tokens?.id_token) {
    const claims = decodeJwt(auth.tokens.id_token)
    const authClaims = claims['https://api.openai.com/auth']
    accountId = authClaims?.chatgpt_account_id
    console.log('Plan:', authClaims?.chatgpt_plan_type)
    console.log('Account ID:', accountId)
  }

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
    'OpenAI-Beta': 'responses=experimental',
    'originator': 'codex_cli_rs',
    'session_id': crypto.randomUUID(),
  }
  if (accountId) headers['chatgpt-account-id'] = accountId

  const payload = {
    model: 'gpt-5',
    instructions: 'Be concise.',
    input: [
      { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Say hi' }] },
    ],
    store: false,
    stream: true,
  }

  // Test with tools included (as Codex does)
  const payloadWithTools = {
    ...payload,
    tools: [{
      type: 'function',
      name: 'shell',
      description: 'Run a shell command',
      parameters: {
        type: 'object',
        properties: { command: { type: 'array', items: { type: 'string' } } },
        required: ['command'],
        additionalProperties: false,
      },
      strict: false,
    }],
    tool_choice: 'auto',
    parallel_tool_calls: false,
  }

  // Test different combinations
  await testUrl('https://chatgpt.com/backend-api/codex/responses', payload, headers)
  await testUrl('https://chatgpt.com/backend-api/codex/responses', payloadWithTools, headers)

  // Try without originator
  const headers2 = { ...headers }
  delete headers2['originator']
  await testUrl('https://chatgpt.com/backend-api/codex/responses', payload, headers2)

  // Try without OpenAI-Beta
  const headers3 = { ...headers }
  delete headers3['OpenAI-Beta']
  await testUrl('https://chatgpt.com/backend-api/codex/responses', payload, headers3)
}

main().catch(console.error)
