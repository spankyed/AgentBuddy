// An action step names an Action or carries its own code, never both and never neither. The union in types.ts
// puts that to the compiler, so the cases below are `@ts-expect-error` rather than assertions: typecheck:pack
// fails if any of them stops being an error.
import { describe, expect, it } from 'vitest'
import { action, actionCode } from '#generated/flow-helpers.ts'
import type { DSLActionNode } from '#extensions/steps/action/types.ts'

describe('the action helpers', () => {
  it('build the two shapes', () => {
    expect(action('Send', { label: 'send' })).toEqual({ type: 'action', action: 'Send', label: 'send' })
    expect(actionCode('return 1', { label: 'compute' }))
      .toEqual({ type: 'action', mode: 'code', actionFn: 'return 1', label: 'compute' })
  })

  it('refuse the combinations that have no meaning', () => {
    // A named action carrying code: which one runs?
    // @ts-expect-error actionFn belongs to code mode
    const both: DSLActionNode = { type: 'action', action: 'Send', actionFn: 'return 1' }
    // Code mode with no code
    // @ts-expect-error actionFn is required in code mode
    const neither: DSLActionNode = { type: 'action', mode: 'code' }
    // Code mode naming an action it cannot instance
    // @ts-expect-error an action name has no meaning in code mode
    const named: DSLActionNode = { type: 'action', mode: 'code', actionFn: 'return 1', action: 'Send' }

    expect([both, neither, named]).toHaveLength(3)
  })
})
