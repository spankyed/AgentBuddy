/**
 * Unit test for `parseStepResponse` — the pure helper that narrows a
 * raw block response into a step-specific discriminated union for the
 * onboarding flow.
 *
 * Mirrors the `claude-code-approval-response.spec.ts` and
 * `claude-code-plan-approval.spec.ts` patterns — pure function,
 * colocated with the helper it tests, uses the existing vitest
 * infrastructure in this workspace.
 *
 * Regression guards below explicitly pin the `{ value: 'legacy' }`
 * shape as NOT valid — that was the stale dead-code fallback the
 * onboarding handler used to carry from the pre-approval-fix era,
 * and we want a failing test if anyone tries to restore it.
 */

import {
  parseStepResponse,
  type ParsedStepResponse,
} from '../../src/actions/onboarding/_helpers/parse-step-response'

describe('parseStepResponse', () => {
  describe('name step', () => {
    it('raw string → { step: "name", name, cancelled: false }', () => {
      expect(parseStepResponse('name', 'Alice')).toEqual({
        step: 'name',
        name: 'Alice',
        cancelled: false,
      })
    })

    it('empty string → empty name, cancelled false', () => {
      expect(parseStepResponse('name', '')).toEqual({
        step: 'name',
        name: '',
        cancelled: false,
      })
    })

    it('cancelled sentinel → empty name, cancelled true', () => {
      expect(parseStepResponse('name', { cancelled: true })).toEqual({
        step: 'name',
        name: '',
        cancelled: true,
      })
    })
  })

  describe('tech-level step', () => {
    it('raw choice id → { step: "tech-level", techLevel, cancelled: false }', () => {
      expect(parseStepResponse('tech-level', 'comfortable')).toEqual({
        step: 'tech-level',
        techLevel: 'comfortable',
        cancelled: false,
      })
    })

    it('empty string → empty techLevel, cancelled false', () => {
      expect(parseStepResponse('tech-level', '')).toEqual({
        step: 'tech-level',
        techLevel: '',
        cancelled: false,
      })
    })

    it('cancelled sentinel → empty techLevel, cancelled true', () => {
      expect(parseStepResponse('tech-level', { cancelled: true })).toEqual({
        step: 'tech-level',
        techLevel: '',
        cancelled: true,
      })
    })
  })

  describe('projects step', () => {
    it('multiline raw string → { step: "projects", rawText, cancelled: false }', () => {
      const raw = '/tmp/a\n/tmp/b\n'
      expect(parseStepResponse('projects', raw)).toEqual({
        step: 'projects',
        rawText: raw,
        cancelled: false,
      })
    })

    it('empty string → empty rawText, cancelled false', () => {
      expect(parseStepResponse('projects', '')).toEqual({
        step: 'projects',
        rawText: '',
        cancelled: false,
      })
    })

    it('cancelled sentinel → empty rawText, cancelled true', () => {
      expect(parseStepResponse('projects', { cancelled: true })).toEqual({
        step: 'projects',
        rawText: '',
        cancelled: true,
      })
    })
  })

  describe('finish step', () => {
    it('any response → { step: "finish", cancelled: false } on happy path', () => {
      expect(parseStepResponse('finish', 'project-id')).toEqual({
        step: 'finish',
        cancelled: false,
      })
    })

    it('cancelled sentinel → { step: "finish", cancelled: true }', () => {
      expect(parseStepResponse('finish', { cancelled: true })).toEqual({
        step: 'finish',
        cancelled: true,
      })
    })
  })

  // ─── Fail-safe: unexpected shapes degrade, not throw ────────────────
  //
  // The rule: if we can't extract a raw string or detect the cancelled
  // sentinel, degrade to "empty input with cancelled:false". This
  // matches the step handlers' existing defensive defaults.

  it.each([
    [null, 'null'],
    [undefined, 'undefined'],
    [42, 'number'],
    [true, 'bare boolean'],
    [{}, 'empty object'],
    [{ value: 'legacy' }, 'legacy { value } shape — pins the regression guard'],
    [[], 'empty array'],
    [['a', 'b'], 'array (choice multi-select would emit this)'],
  ] as const)(
    'unknown shape %p (%s) on name step → empty + cancelled:false',
    (input, _description) => {
      const result = parseStepResponse('name', input)
      expect(result.step).toBe('name')
      expect((result as Extract<ParsedStepResponse, { step: 'name' }>).name).toBe('')
      expect((result as Extract<ParsedStepResponse, { step: 'name' }>).cancelled).toBe(false)
    },
  )

  it('legacy { value: "Alice" } shape does NOT pretend to be a valid name — regression guard', () => {
    // Explicit test for the class of bug the onboarding handler used
    // to "fix" with `response?.value ?? response`. No onboarding block
    // has ever emitted this shape; treating it as a valid name would
    // be covering a bug that never existed and masking a future one.
    const result = parseStepResponse('name', { value: 'Alice' })
    expect((result as Extract<ParsedStepResponse, { step: 'name' }>).name).toBe('')
  })

  it('only {cancelled:true} — not other truthy cancelled values — sets cancelled flag', () => {
    // The sentinel is exact, not truthy-coerced. If a future block
    // ever emits `{ cancelled: 'yes' }` or similar, we want the
    // parser to NOT treat it as cancelled (fail loudly via "didn't
    // match the known sentinel") rather than silently accept and
    // lose information.
    expect(parseStepResponse('name', { cancelled: 'yes' as unknown as boolean }))
      .toEqual({ step: 'name', name: '', cancelled: false })
    expect(parseStepResponse('name', { cancelled: 1 as unknown as boolean }))
      .toEqual({ step: 'name', name: '', cancelled: false })
  })
})
