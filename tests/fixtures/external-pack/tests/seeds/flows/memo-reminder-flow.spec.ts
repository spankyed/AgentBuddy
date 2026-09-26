// The pack's scheduled flow, built with default-setup's flow helpers (branch, schedule and the step helpers' typed options)
import { describe, expect, it, vi } from 'vitest';
import type { FlowDSL } from '@abuddy/sdk/build';
import { importFlows, mockService, importSeeds, startApp } from '@abuddy/testing/harness';
import { action, branch, entry, fire, keepAlive, on, schedule, subflow } from '#generated/flow-helpers';
import { repository } from '#generated/repository';
import type { Services } from '#generated/services';
import memoReminderFlow from '../../../src/seeds/flows/memo-reminder-flow';

describe('memo reminder flow', () => {
  it('adds the memo on each scheduled tick and branches on the result', async () => {
    let tick!: () => void;
    let registered!: () => void;
    const scheduled = new Promise<void>((resolve) => { registered = resolve; });
    mockService<Services, 'scheduler'>('scheduler', {
      registerSchedule: vi.fn((_key: string, _cron: string, onTick: () => void) => { tick = onTick; registered(); }),
      unregisterByPrefix: vi.fn(),
      clearAllSchedules: vi.fn(),
    });
    await importSeeds({ keys: ['actions'] });
    importFlows({ 'Memo Reminder Flow': { root: true, tracks: memoReminderFlow['Memo Reminder Flow'] } });
    const app = await startApp({ systems: ['default-setup/brain', 'host/settings'] });
    await app.connect();
    await scheduled;

    tick();
    await app.settle();

    expect(app.flowTrace('Memo Reminder Flow').map((step) => [step.label, step.status])).toEqual([
      ['add-reminder', 'completed'],
      ['Added?', 'completed'],
      ['reminded', 'completed'],
    ]);
    expect(repository.memoQueries.all().map((memo) => memo.text)).toEqual(['Weekly review']);
  });

  it("types the helpers' options with default-setup's step nodes", () => {
    const misuse = () => [
      // @ts-expect-error params is a record
      action('Memo: Add', { params: 'Weekly review' }),
      // @ts-expect-error fire's scope is local or global
      fire('memo.reminded', { scope: 'everywhere' }),
      // @ts-expect-error a condition's if is an expression string
      branch([{ if: true, steps: [] }]),
      // @ts-expect-error a schedule's exits are step chains
      schedule('0 9 * * 1', [action('Memo: Add')]),
    ];
    expect(misuse).toBeTypeOf('function');
  });
});

// The flow example in docs/public-facing/seeds.md, which must compile in a pack depending on default-setup
const seedsDocExample = {
  // Linear: entry -> action -> fire
  'Analysis Flow': [
    entry([
      action('Analyze Text', { label: 'analyze' }),
      fire('analysis.complete', { label: 'notify' }),
    ]),
  ],

  // Long-running: init + keep alive + event listeners
  'Monitor Flow': [
    entry([
      action('Initialize', { label: 'init' }),
      keepAlive(),
    ]),
    on('user.message', [[
      action('Process', { label: 'process' }),
      fire('message.processed'),
    ]], 'Handle Message'),
  ],

  // Branching: action -> conditional branches
  'Support Flow': [
    entry([
      action('Classify', { label: 'classify' }),
      branch(
        [
          { if: "$.intent == 'question'", steps: [
            action('Lookup', { label: 'lookup' }),
          ]},
          { if: "$.intent == 'request'", steps: [
            action('Process Request', { label: 'process' }),
          ]},
        ],
        [fire('support.escalated', { label: 'escalate' })],
      ),
    ]),
  ],

  // Parallel entry branches
  'Setup Flow': [
    entry(
      [action('Load Config', { label: 'config' })],
      [action('Warm Cache', { label: 'cache' })],
      [keepAlive()],
    ),
  ],

  // Sub-flow delegation
  'Orchestrator Flow': [
    entry([
      subflow('Analysis Flow', { label: 'run analysis' }),
      fire('orchestration.complete'),
    ]),
  ],
} satisfies FlowDSL;

describe('the seeds.md flow example', () => {
  it("builds its branch with default-setup's switch helper", () => {
    expect(seedsDocExample['Support Flow'][0].exits[0][1]).toEqual({
      type: 'switch',
      conditions: [
        { if: "$.intent == 'question'", steps: [{ type: 'action', action: 'Lookup', label: 'lookup' }] },
        { if: "$.intent == 'request'", steps: [{ type: 'action', action: 'Process Request', label: 'process' }] },
      ],
      else: [{ type: 'fire', event: 'support.escalated', label: 'escalate' }],
    });
  });
});
