/**
 * Tests for the child-env scrubber used by `execOnce` and `spawnStream`.
 *
 * The scrub prevents `ANTHROPIC_API_KEY` (which the API server's `llm.ts`
 * client needs via dotenv) from leaking into the Claude CLI subprocess,
 * where it would override the user's stored `claude auth login` session
 * and fail with "Invalid API key · Fix external API key".
 */

import { buildChildEnv } from '@/services/claude-code/runner'

describe('buildChildEnv', () => {
  const originalKey = process.env.ANTHROPIC_API_KEY

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-dev-placeholder'
  })

  afterEach(() => {
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = originalKey
  })

  it('strips ANTHROPIC_API_KEY from the default (inherited) env', () => {
    const env = buildChildEnv()
    expect(env.ANTHROPIC_API_KEY).toBeUndefined()
    // Other env vars pass through untouched.
    expect(env.PATH).toBe(process.env.PATH)
  })

  it('returns the caller override untouched (does not scrub explicit env)', () => {
    const override = { ANTHROPIC_API_KEY: 'sk-ant-explicit', PATH: '/fake' }
    const env = buildChildEnv(override)
    expect(env).toBe(override) // identity — no copy, no mutation
    expect(env.ANTHROPIC_API_KEY).toBe('sk-ant-explicit')
  })

  it('does not mutate the live process.env', () => {
    buildChildEnv()
    // The helper spreads process.env into a fresh object before deleting,
    // so the parent's own env must stay intact (llm.ts still needs the key).
    expect(process.env.ANTHROPIC_API_KEY).toBe('sk-ant-dev-placeholder')
  })
})
