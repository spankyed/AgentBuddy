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

  it('merges caller overrides into the default env', () => {
    const override = { ANTHROPIC_API_KEY: 'sk-ant-explicit', PATH: '/fake' }
    const env = buildChildEnv(override)
    // Overrides are merged but ANTHROPIC_API_KEY is still stripped.
    expect(env.ANTHROPIC_API_KEY).toBeUndefined()
    expect(env.PATH).toBe('/fake')
  })

  it('does not mutate the live process.env', () => {
    buildChildEnv()
    // The helper spreads process.env into a fresh object before deleting,
    // so the parent's own env must stay intact (llm.ts still needs the key).
    expect(process.env.ANTHROPIC_API_KEY).toBe('sk-ant-dev-placeholder')
  })

  it('sets ENABLE_TOOL_SEARCH=0 so deferred tools (ExitPlanMode, …) are always in Claude\'s initial tools list', () => {
    // Regression guard for the plan-mode UX breakage: Claude Code's
    // tool-search mode defaults to enabled, which hides every tool
    // tagged `shouldDefer: true` (including ExitPlanMode) from Claude
    // on the first turn. Without this env var, plan-mode sessions
    // never fire our ExitPlanMode approval flow because Claude can't
    // actually call the tool. See the leaked-source comment in
    // runner.ts's `buildChildEnv` for the full chain.
    const env = buildChildEnv()
    expect(env.ENABLE_TOOL_SEARCH).toBe('0')
  })

  it('sets ENABLE_TOOL_SEARCH=0 even when caller passes an override', () => {
    const override = { FOO: 'bar' }
    const env = buildChildEnv(override)
    expect(env.FOO).toBe('bar')
    expect(env.ENABLE_TOOL_SEARCH).toBe('0')
  })
})
