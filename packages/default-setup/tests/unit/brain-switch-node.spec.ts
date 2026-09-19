/**
 * The switch step, run in flows on the brain (@abuddy/testing's runFlow): which branch a switch takes,
 * and that a chain ends when nothing matches.
 *
 * Covers the regression for Bug A: before, when no condition matched and there was no else,
 * `evaluateConditions` returned `conditions.length - 1`, routing into the LAST condition's steps even
 * though its predicate was false. Now the switch completes with `noMatch: true` and the chain ends.
 */
import { describe, expect, it } from 'vitest'
import { importFlows, startApp, type FlowRun } from '@abuddy/testing/harness'
import { on, transform } from '@/__generated__/flow-helpers'
import { branch } from '@/extensions/steps/switch/helpers'
import { repository } from '@/__generated__/repository'
import { EARS, findWhere } from '@/__generated__/ears'
import type { DSLStepNode } from '@abuddy/sdk/build'
import type { Condition } from '@/extensions/steps/switch/types'

const step = (label: string) => transform('return true', { label })
const when = (cmd: string) => `$.event.data.payload.cmd == '${cmd}'`

/** A root flow whose `command` track is the switch; returns the flow's label */
function switchFlow(label: string, switchStep: DSLStepNode): string {
  importFlows({ [label]: { root: true, tracks: [on('command', [[switchStep]])] } })
  return label
}

/** Starts the app, whose brain runs the root flow, and sends it a `command` */
async function runCommand(flow: string, data: Record<string, unknown>): Promise<FlowRun> {
  const app = await startApp({ systems: ['brain', 'settings'] })
  return app.runFlow(flow, { event: 'command', data })
}

const switchResult = (run: FlowRun) => run.steps.find((s) => s.label === 'Switch')?.nodeAttributes.result as Record<string, unknown>
const ranAfterSwitch = (run: FlowRun) => run.steps.filter((s) => s.label !== 'Switch').map((s) => s.label)

/** Replaces the flow's switch conditions, as the flow editor can (code-mode predicates, none at all) */
function setConditions(flowLabel: string, conditions: Condition[]): void {
  const flowId = findWhere(EARS.Entity.Flow, 'label', flowLabel)[0].id
  const node = repository.flowsQueries.flowNodes(flowId).find((n: { nodeType: string }) => n.nodeType === 'switch')!
  repository.flowsCommands.updateNode(node.id, { conditions } as never)
}

describe('switch step', () => {
  describe('single condition', () => {
    it('matches and runs branch-0', async () => {
      const flow = switchFlow('Single', branch([{ if: when('claude-code'), steps: [step('match-claude-code')] }]))
      const run = await runCommand(flow, { cmd: 'claude-code' })

      expect(switchResult(run)).toEqual({ nodeType: 'switch', branchIndex: 0, sourceHandle: 'branch-0', branchLabel: 'match-claude-code' })
      expect(ranAfterSwitch(run)).toEqual(['match-claude-code'])
    })

    it('does not match, no else → completes with noMatch and ends the chain (Bug A regression)', async () => {
      const flow = switchFlow('Single no match', branch([{ if: when('work'), steps: [step('work')] }]))
      const run = await runCommand(flow, { cmd: 'chat' })

      expect(switchResult(run)).toMatchObject({ nodeType: 'switch', branchIndex: -1, noMatch: true })
      expect(switchResult(run).sourceHandle).toBeUndefined()
      expect(ranAfterSwitch(run)).toEqual([])
    })
  })

  describe('multiple conditions', () => {
    const commands = () => branch([
      { if: when('gcmsg'), steps: [step('gcmsg')] },
      { if: when('pr2md'), steps: [step('pr2md')] },
    ])

    it('first condition matches → branch-0', async () => {
      const run = await runCommand(switchFlow('First', commands()), { cmd: 'gcmsg' })
      expect(switchResult(run)).toMatchObject({ branchIndex: 0, sourceHandle: 'branch-0', branchLabel: 'gcmsg' })
      expect(ranAfterSwitch(run)).toEqual(['gcmsg'])
    })

    it('second condition matches → branch-1', async () => {
      const run = await runCommand(switchFlow('Second', commands()), { cmd: 'pr2md' })
      expect(switchResult(run)).toMatchObject({ branchIndex: 1, sourceHandle: 'branch-1', branchLabel: 'pr2md' })
      expect(ranAfterSwitch(run)).toEqual(['pr2md'])
    })

    it('no condition matches, no else → noMatch', async () => {
      const run = await runCommand(switchFlow('Neither', commands()), { cmd: 'unknown' })
      expect(switchResult(run)).toMatchObject({ branchIndex: -1, noMatch: true })
      expect(ranAfterSwitch(run)).toEqual([])
    })

    it('no real condition matches, explicit else → else branch wins (last index)', async () => {
      const flow = switchFlow('Else', branch([
        { if: when('gcmsg'), steps: [step('gcmsg')] },
        { if: when('pr2md'), steps: [step('pr2md')] },
      ], [step('fallback')]))
      const run = await runCommand(flow, { cmd: 'unknown' })

      expect(switchResult(run)).toEqual({ nodeType: 'switch', branchIndex: 2, sourceHandle: 'branch-2', branchLabel: 'fallback' })
      expect(ranAfterSwitch(run)).toEqual(['fallback'])
    })
  })

  describe('edge cases', () => {
    it('zero conditions → the switch fails with a validation error', async () => {
      const flow = switchFlow('Empty', branch([{ if: when('any'), steps: [step('any')] }]))
      setConditions(flow, [])
      const run = await runCommand(flow, { cmd: 'any' })

      const switchStep = run.steps.find((s) => s.label === 'Switch')
      expect(switchStep?.status).toBe('failed')
      expect(switchStep?.nodeAttributes.result).toEqual({
        error: expect.objectContaining({ source: 'brain-switch', phase: 'switch.validate', message: expect.stringMatching(/no conditions/i) }),
      })
      expect(ranAfterSwitch(run)).toEqual([])
    })

    it('code-mode predicate that throws is treated as non-match, evaluation continues', async () => {
      const flow = switchFlow('Code throws', branch([{ if: when('ok'), steps: [step('ok')] }]))
      setConditions(flow, [
        { mode: 'code', code: 'throw new Error("boom")', label: 'thrower' },
        { predicate: { key: '$.event.data.payload.cmd', operator: 'equals' as never, value: 'ok' }, label: 'ok' },
      ])
      const run = await runCommand(flow, { cmd: 'ok' })

      expect(switchResult(run)).toMatchObject({ branchIndex: 1, sourceHandle: 'branch-1' })
    })

    it('code-mode predicate that throws, with no other match → noMatch', async () => {
      const flow = switchFlow('Code throws alone', branch([{ if: when('ok'), steps: [step('ok')] }]))
      setConditions(flow, [{ mode: 'code', code: 'throw new Error("boom")', label: 'thrower' }])
      const run = await runCommand(flow, {})

      expect(switchResult(run)).toMatchObject({ noMatch: true })
      expect(ranAfterSwitch(run)).toEqual([])
    })
  })
})
