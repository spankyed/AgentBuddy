/**
 * Example flows — reference for writing new flows.
 *
 * Demonstrates: linear, branching, long-running, parallel exits, and sub-flow patterns.
 * Uses helper functions from _patterns.ts for concise DSL authoring.
 */
import type { FlowDSL } from '../types';
import { entry, on, keepAlive, branch, action, fire, subflow } from '../flows/_patterns';

export default {
  /** Linear: entry → action → fire */
  'Analysis Flow': [
    entry([
      action('Analyze Text', { label: 'analyze' }),
      fire('analysis.complete', { label: 'notify' }),
    ]),
  ],

  /** Branching: action → switch → per-branch steps */
  'Support Flow': [
    entry([
      action('Analyze Text', { label: 'classify' }),
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

  /** Long-running: init step + keep_alive + event listeners */
  'Monitor Flow': [
    entry([
      action('Initialize', { label: 'init' }),
      keepAlive(),
    ]),
    on('user.message', [[
      action('Process', { label: 'process' }),
      fire('message.processed'),
    ]], 'Handle Message'),
    on('user.disconnect', [[
      fire('session.ended', { label: 'end' }),
    ]], 'Handle Disconnect'),
  ],

  /** Parallel exits: one listener triggers independent chains */
  'Notification Flow': [
    entry([
      action('Initialize', { label: 'init' }),
      keepAlive(),
    ]),
    on('order.placed', [
      [
        action('Send Email', { label: 'email' }),
        fire('email.sent'),
      ],
      [
        action('Update Inventory', { label: 'inventory' }),
        fire('inventory.updated'),
      ],
    ], 'Handle Order'),
  ],

  /** Parallel entry branches: spawn independent chains on flow start */
  'Setup Flow': [
    entry(
      [action('Load Config', { label: 'config' })],
      [action('Warm Cache', { label: 'cache' })],
      [keepAlive()],
    ),
    on('user.ready', [[
      action('Greet User', { label: 'greet' }),
    ]], 'Handle Ready'),
  ],

  /** Sub-flow: delegate to another flow */
  'Orchestrator Flow': [
    entry([
      subflow('Analysis Flow', { label: 'run analysis' }),
      fire('orchestration.complete'),
    ]),
  ],
} satisfies FlowDSL;
