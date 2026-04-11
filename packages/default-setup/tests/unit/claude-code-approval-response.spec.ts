/**
 * Unit test for `parseApprovalDecision` — the single source of truth for
 * the approval-block response shape contract between the frontend
 * (ApprovalButtons.vue → InteractionContainer.vue) and any backend
 * action that drives an approval flow (chat.ts).
 *
 * Regression guard for a specific failure mode: every "Allow" click was
 * being silently converted to a "Deny" because chat.ts was checking a
 * stale `{ value: 'yes' | 'no' }` shape that the frontend doesn't emit.
 * The canonical shape is `{ approved: boolean, reason?: string }`.
 *
 * Colocated with the helper under test (`src/actions/claude-code/_helpers/`)
 * so ownership is clear and renames / moves stay within one package.
 */

import {
  parseApprovalDecision,
  type ApprovalDecision,
} from '../../src/actions/claude-code/_helpers/approval-response'

describe('parseApprovalDecision', () => {
  // ─── Canonical happy paths ─────────────────────────────────────────────
  // These lock down the shape chat.ts (and any future approval-driving
  // action) must support. If the frontend shape ever evolves, update
  // `parseApprovalDecision` first — these assertions are the contract.

  it('canonical shape: { approved: true } → allow with undefined reason', () => {
    const decision: ApprovalDecision = parseApprovalDecision({ approved: true })
    expect(decision).toEqual({ allow: true, reason: undefined })
  })

  it('canonical shape: { approved: false } → deny with undefined reason', () => {
    const decision: ApprovalDecision = parseApprovalDecision({ approved: false })
    expect(decision).toEqual({ allow: false, reason: undefined })
  })

  it('passes through the reason string on allow', () => {
    expect(parseApprovalDecision({ approved: true, reason: 'trust me' }))
      .toEqual({ allow: true, reason: 'trust me' })
  })

  it('passes through the reason string on deny', () => {
    expect(parseApprovalDecision({ approved: false, reason: 'looks scary' }))
      .toEqual({ allow: false, reason: 'looks scary' })
  })

  // ─── Fail-safe contract: anything unexpected → deny ────────────────────
  // The rule: if we can't confidently parse an explicit `approved: true`,
  // the user's decision is considered a deny. Degrading to "my allow
  // didn't stick" is a much safer failure mode than "a denied tool ran
  // silently". Every case in the table below MUST land in deny. In
  // particular, the `{ value: 'yes' }` legacy shape case is deliberate:
  // it guards against anyone reintroducing the stale backwards-compat
  // check that caused the original bug.

  it.each([
    [null, 'null'],
    [undefined, 'undefined'],
    ['yes', 'bare string'],
    [42, 'number'],
    [true, 'bare boolean'],
    [{}, 'empty object'],
    [{ value: 'yes' }, 'legacy { value } shape'],
    [{ approved: 'true' }, 'stringified boolean'],
    [{ approved: 1 }, 'truthy non-boolean'],
    [{ approved: null }, 'null approved'],
    [{ cancelled: true }, 'cancelled dismissal shape'],
  ] as const)('unknown shape %p (%s) → deny', (input, _description) => {
    expect(parseApprovalDecision(input).allow).toBe(false)
  })

  it('ignores non-string reason values on an otherwise-valid approval', () => {
    expect(parseApprovalDecision({ approved: true, reason: 42 }))
      .toEqual({ allow: true, reason: undefined })
  })

  it('ignores non-string reason values on a deny', () => {
    expect(parseApprovalDecision({ approved: false, reason: { nested: 'obj' } }))
      .toEqual({ allow: false, reason: undefined })
  })
})
