/**
 * Tests for the brain switch-node handler.
 *
 * Covers the regression for Bug A: before, when no condition matched and
 * there was no else, `evaluateConditions` returned `conditions.length - 1`
 * — causing the flow-system to route into the LAST condition's steps even
 * though its predicate was false. Now the handler emits a `noMatch: true`
 * completion and the chain ends cleanly.
 *
 * The handler is a plain function that takes a fake actor (anything with a
 * `.send()` method) so we don't need XState here — just capture the
 * outbound events and assert their shape.
 */

import { switchNodeHandler } from '@/systems/brain/node-handlers/switch-node'
import { BinaryOperator } from '@/systems/flows/config/types'
import type { Condition, SwitchNode } from '@/systems/flows/config/types'
import type { ExecutionContext, TNodeEntity } from '@/systems/brain/types'

// ─── Fakes ───────────────────────────────────────────────────────────────────

interface CapturedEvent { type: string; result?: any; error?: any }

function makeActor() {
  const sent: CapturedEvent[] = []
  return {
    send: (ev: CapturedEvent) => { sent.push(ev) },
    sent,
  }
}

function makeTNode(overrides: Partial<TNodeEntity> = {}): TNodeEntity {
  return {
    id: 'TNode-fake-1' as any,
    entityType: 'TNode' as any,
    tNodeType: 'step' as any,
    label: 'fake',
    status: 'running' as any,
    startedAt: Date.now() as any,
    ...overrides,
  } as TNodeEntity
}

function makeSwitchNode(conditions: Condition[], label = 'test-switch'): SwitchNode {
  return {
    id: 'Node-switch-1' as any,
    entityType: 'Node' as any,
    nodeType: 'switch',
    label,
    conditions,
  } as unknown as SwitchNode
}

function makeContext(eventData: Record<string, unknown> = {}): ExecutionContext {
  return {
    flowTNodeId: 'TNode-flow-1' as any,
    event: {
      type: 'user.message',
      data: eventData,
    },
    steps: [],
  }
}

// Convenience: condition that matches when `$.value` equals `expected`.
function condEquals(path: string, expected: unknown, label?: string): Condition {
  return {
    predicate: { key: path, operator: BinaryOperator.EQUALS, value: expected },
    label,
  }
}

// Convenience: predicate-less condition = always matches (the compiler
// appends this when the DSL includes an `else`).
function condElse(label = 'else'): Condition {
  return { label }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('switchNodeHandler', () => {
  describe('single condition', () => {
    it('matches and emits branch-0 completion', () => {
      const node = makeSwitchNode([condEquals('$.event.data.mode', 'claude-code', 'match-claude-code')])
      const ctx = makeContext({ mode: 'claude-code' })
      const actor = makeActor()

      switchNodeHandler(makeTNode(), node, ctx, actor)

      expect(actor.sent).toHaveLength(1)
      const [ev] = actor.sent
      expect(ev.type).toBe('COMPLETE')
      expect(ev.result.nodeType).toBe('switch')
      expect(ev.result.branchIndex).toBe(0)
      expect(ev.result.sourceHandle).toBe('branch-0')
      expect(ev.result.branchLabel).toBe('match-claude-code')
      expect(ev.result.noMatch).toBeUndefined()
    })

    it('does not match, no else → emits noMatch:true completion (Bug A regression)', () => {
      const node = makeSwitchNode([condEquals('$.event.data.mode', 'work')])
      const ctx = makeContext({ mode: 'chat' })
      const actor = makeActor()

      switchNodeHandler(makeTNode(), node, ctx, actor)

      expect(actor.sent).toHaveLength(1)
      const [ev] = actor.sent
      expect(ev.type).toBe('COMPLETE')
      expect(ev.result.nodeType).toBe('switch')
      expect(ev.result.branchIndex).toBe(-1)
      expect(ev.result.sourceHandle).toBeUndefined()
      expect(ev.result.noMatch).toBe(true)
    })
  })

  describe('multiple conditions', () => {
    it('first condition matches → branch-0', () => {
      const node = makeSwitchNode([
        condEquals('$.event.data.cmd', 'gcmsg', 'gcmsg'),
        condEquals('$.event.data.cmd', 'pr2md', 'pr2md'),
      ])
      const actor = makeActor()

      switchNodeHandler(makeTNode(), node, makeContext({ cmd: 'gcmsg' }), actor)

      expect(actor.sent).toHaveLength(1)
      expect(actor.sent[0].result.branchIndex).toBe(0)
      expect(actor.sent[0].result.sourceHandle).toBe('branch-0')
      expect(actor.sent[0].result.branchLabel).toBe('gcmsg')
    })

    it('second condition matches → branch-1', () => {
      const node = makeSwitchNode([
        condEquals('$.event.data.cmd', 'gcmsg', 'gcmsg'),
        condEquals('$.event.data.cmd', 'pr2md', 'pr2md'),
      ])
      const actor = makeActor()

      switchNodeHandler(makeTNode(), node, makeContext({ cmd: 'pr2md' }), actor)

      expect(actor.sent).toHaveLength(1)
      expect(actor.sent[0].result.branchIndex).toBe(1)
      expect(actor.sent[0].result.sourceHandle).toBe('branch-1')
      expect(actor.sent[0].result.branchLabel).toBe('pr2md')
    })

    it('no condition matches, no else → noMatch:true', () => {
      const node = makeSwitchNode([
        condEquals('$.event.data.cmd', 'gcmsg'),
        condEquals('$.event.data.cmd', 'pr2md'),
      ])
      const actor = makeActor()

      switchNodeHandler(makeTNode(), node, makeContext({ cmd: 'unknown' }), actor)

      expect(actor.sent).toHaveLength(1)
      expect(actor.sent[0].result.branchIndex).toBe(-1)
      expect(actor.sent[0].result.noMatch).toBe(true)
    })

    it('no real condition matches, explicit else → else branch wins (last index)', () => {
      // The compiler appends `else` as a trailing predicate-less condition.
      // `evaluatePredicate(undefined)` returns true, so it naturally matches.
      const node = makeSwitchNode([
        condEquals('$.event.data.cmd', 'gcmsg', 'gcmsg'),
        condEquals('$.event.data.cmd', 'pr2md', 'pr2md'),
        condElse('fallback'),
      ])
      const actor = makeActor()

      switchNodeHandler(makeTNode(), node, makeContext({ cmd: 'unknown' }), actor)

      expect(actor.sent).toHaveLength(1)
      expect(actor.sent[0].result.branchIndex).toBe(2)
      expect(actor.sent[0].result.sourceHandle).toBe('branch-2')
      expect(actor.sent[0].result.branchLabel).toBe('fallback')
      expect(actor.sent[0].result.noMatch).toBeUndefined()
    })
  })

  describe('edge cases', () => {
    it('zero conditions → emits ERROR', () => {
      const node = makeSwitchNode([])
      const actor = makeActor()

      switchNodeHandler(makeTNode(), node, makeContext(), actor)

      expect(actor.sent).toHaveLength(1)
      expect(actor.sent[0].type).toBe('ERROR')
      expect(actor.sent[0].error.message).toMatch(/no conditions/i)
      expect(actor.sent[0].error.source).toBe('brain-switch')
      expect(actor.sent[0].error.phase).toBe('switch.validate')
    })

    it('code-mode predicate that throws is treated as non-match, evaluation continues', () => {
      const boomCondition: Condition = {
        mode: 'code',
        code: 'throw new Error("boom")',
        label: 'thrower',
      }
      const okCondition = condEquals('$.event.data.cmd', 'ok', 'ok')
      const node = makeSwitchNode([boomCondition, okCondition])
      const actor = makeActor()

      switchNodeHandler(makeTNode(), node, makeContext({ cmd: 'ok' }), actor)

      // First condition throws → false → evaluator moves on.
      // Second condition matches → branch-1.
      expect(actor.sent).toHaveLength(1)
      expect(actor.sent[0].type).toBe('COMPLETE')
      expect(actor.sent[0].result.branchIndex).toBe(1)
    })

    it('code-mode predicate that throws, with no other match → noMatch:true', () => {
      const boomCondition: Condition = {
        mode: 'code',
        code: 'throw new Error("boom")',
        label: 'thrower',
      }
      const node = makeSwitchNode([boomCondition])
      const actor = makeActor()

      switchNodeHandler(makeTNode(), node, makeContext({}), actor)

      expect(actor.sent).toHaveLength(1)
      expect(actor.sent[0].type).toBe('COMPLETE')
      expect(actor.sent[0].result.noMatch).toBe(true)
    })
  })
})
