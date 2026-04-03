/**
 * Example flows — reference for writing new flows.
 *
 * Demonstrates: linear, branching, long-running, parallel exits, and sub-flow patterns.
 * Uses helper functions from _patterns.ts for concise DSL authoring.
 */
import type { FlowDSL } from '../types';
import { entryTrack, branch, entryWithListeners, action, fire, subflow } from '../flows/_patterns';

export default {
  /** Linear: entry → action → fire */
  'Analysis Flow': [
    entryTrack([
      action('Analyze Text', { label: 'analyze' }),
      fire('analysis.complete', { label: 'notify' }),
    ]),
  ],

  /** Branching: action → switch → per-branch steps */
  'Support Flow': [
    entryTrack([
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

  /** Long-running: entry with keep_alive + multiple event listeners */
  'Monitor Flow': entryWithListeners(
    [action('Initialize', { label: 'init' })],
    [
      { event: 'user.message', label: 'Handle Message', exits: [[
        action('Process', { label: 'process' }),
        fire('message.processed'),
      ]]},
      { event: 'user.disconnect', label: 'Handle Disconnect', exits: [[
        fire('session.ended', { label: 'end' }),
      ]]},
    ],
  ),

  /** Parallel exits: one listener triggers independent chains */
  'Notification Flow': entryWithListeners(
    [action('Initialize', { label: 'init' })],
    [
      { event: 'order.placed', label: 'Handle Order', exits: [
        [
          action('Send Email', { label: 'email' }),
          fire('email.sent'),
        ],
        [
          action('Update Inventory', { label: 'inventory' }),
          fire('inventory.updated'),
        ],
      ]},
    ],
  ),

  /** Sub-flow: delegate to another flow */
  'Orchestrator Flow': [
    entryTrack([
      subflow('Analysis Flow', { label: 'run analysis' }),
      fire('orchestration.complete'),
    ]),
  ],
} satisfies FlowDSL;
