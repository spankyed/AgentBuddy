/**
 * Unit test for `parseExitPlanModeInput` + `buildPlanApprovalContext` —
 * the pure helpers that normalise the Claude Code CLI's `ExitPlanMode`
 * tool input into the shape chat.ts uses to render a plan artifact
 * and a plan-specific approval block.
 *
 * The CLI's SDK-facing input schema (leaked source at
 *   packages/claude-code/src/tools/ExitPlanModeTool/ExitPlanModeV2Tool.ts:97-108)
 * is `{ plan?: string, planFilePath?: string, allowedPrompts?: Array<{ tool:'Bash', prompt:string }> }`.
 * These helpers defensively parse that shape without throwing even if
 * the CLI ever reshuffles fields, which is important because they run
 * inside the pump's control_request dispatch and must not break the
 * stream on malformed payloads.
 *
 * Colocated with the helper under test (`src/actions/claude-code/_helpers/`)
 * so ownership is clear and renames / moves stay within one package.
 */

import {
  parseExitPlanModeInput,
  buildPlanApprovalContext,
  type ParsedPlanInput,
} from '../../src/actions/claude-code/_helpers/plan-approval'

describe('parseExitPlanModeInput', () => {
  it('canonical SDK input shape → full parsed result', () => {
    const input = {
      plan: '# Plan\n\n1. Do the thing\n2. Then the other thing',
      planFilePath: '/tmp/claude-plan-123.md',
      allowedPrompts: [{ tool: 'Bash', prompt: 'run tests' }],
    }
    expect(parseExitPlanModeInput(input)).toEqual({
      plan: '# Plan\n\n1. Do the thing\n2. Then the other thing',
      planFilePath: '/tmp/claude-plan-123.md',
      allowedPrompts: [{ tool: 'Bash', prompt: 'run tests' }],
    })
  })

  it('missing plan → empty string (not undefined) and empty allowedPrompts', () => {
    const parsed = parseExitPlanModeInput({})
    expect(parsed.plan).toBe('')
    expect(parsed.allowedPrompts).toEqual([])
    expect(parsed.planFilePath).toBeUndefined()
  })

  it('non-string plan field is ignored, never thrown', () => {
    expect(parseExitPlanModeInput({ plan: 42 }).plan).toBe('')
    expect(parseExitPlanModeInput({ plan: null }).plan).toBe('')
    expect(parseExitPlanModeInput({ plan: { nested: 'x' } }).plan).toBe('')
  })

  it('drops malformed allowedPrompts entries but keeps valid ones', () => {
    // This is the resilience test — the CLI's input schema is relatively
    // stable but `.passthrough()` is used liberally, so we should not
    // crash on unexpected garbage in a single array entry.
    const input = {
      plan: 'x',
      allowedPrompts: [
        { tool: 'Bash', prompt: 'valid' },
        { tool: 'NotBash', prompt: 'wrong tool' },
        { tool: 'Bash' },                         // missing prompt
        { tool: 'Bash', prompt: 42 },              // non-string prompt
        'not-an-object',
        null,
        undefined,
        { prompt: 'no tool field' },
      ],
    }
    expect(parseExitPlanModeInput(input).allowedPrompts).toEqual([
      { tool: 'Bash', prompt: 'valid' },
    ])
  })

  it('non-array allowedPrompts becomes empty array', () => {
    expect(parseExitPlanModeInput({ plan: 'x', allowedPrompts: 'str' }).allowedPrompts).toEqual([])
    expect(parseExitPlanModeInput({ plan: 'x', allowedPrompts: null }).allowedPrompts).toEqual([])
    expect(parseExitPlanModeInput({ plan: 'x', allowedPrompts: {} }).allowedPrompts).toEqual([])
  })

  it.each([null, undefined, 'string', 42, [], true] as const)(
    'non-object input %p → empty parsed shape',
    (input) => {
      expect(parseExitPlanModeInput(input)).toEqual({ plan: '', allowedPrompts: [] })
    },
  )
})

describe('buildPlanApprovalContext', () => {
  const baseParsed = (overrides: Partial<ParsedPlanInput> = {}): ParsedPlanInput => ({
    plan: '',
    allowedPrompts: [],
    ...overrides,
  })

  it('short plan → full body, no footer when no allowedPrompts', () => {
    const ctx = buildPlanApprovalContext(baseParsed({
      plan: '# Do the thing\n\n1. Step one',
    }))
    expect(ctx).toBe('# Do the thing\n\n1. Step one')
  })

  it('long plan → truncated with trailing ellipsis and length under the cap', () => {
    const long = 'A'.repeat(500)
    const ctx = buildPlanApprovalContext(baseParsed({ plan: long }))
    expect(ctx.length).toBeLessThanOrEqual(360)
    expect(ctx.endsWith('…')).toBe(true)
  })

  it('trims whitespace before measuring length', () => {
    const ctx = buildPlanApprovalContext(baseParsed({ plan: '\n\n  hi  \n\n' }))
    expect(ctx).toBe('hi')
  })

  it('empty plan → placeholder', () => {
    expect(buildPlanApprovalContext(baseParsed({ plan: '' }))).toBe('(no plan content provided)')
  })

  it('whitespace-only plan → placeholder', () => {
    expect(buildPlanApprovalContext(baseParsed({ plan: '   \n\n  \t' })))
      .toBe('(no plan content provided)')
  })

  it('appends allowedPrompts as a "Requested permissions:" footer', () => {
    const ctx = buildPlanApprovalContext(baseParsed({
      plan: 'Short plan',
      allowedPrompts: [
        { tool: 'Bash', prompt: 'run tests' },
        { tool: 'Bash', prompt: 'install deps' },
      ],
    }))
    expect(ctx).toContain('Short plan')
    expect(ctx).toContain('Requested permissions:')
    expect(ctx).toContain('• Bash: run tests')
    expect(ctx).toContain('• Bash: install deps')
  })

  it('empty plan + allowedPrompts → placeholder + footer', () => {
    const ctx = buildPlanApprovalContext(baseParsed({
      plan: '',
      allowedPrompts: [{ tool: 'Bash', prompt: 'run tests' }],
    }))
    expect(ctx.startsWith('(no plan content provided)')).toBe(true)
    expect(ctx).toContain('• Bash: run tests')
  })
})
