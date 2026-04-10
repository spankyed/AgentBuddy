import type { FlowDSL } from '../types';
import { on, action } from './_patterns';

/**
 * Claude Code work-mode flow.
 *
 * Listens for `user.message` events and forwards them to the Claude Code
 * Chat action. The action itself filters on `mode === 'work'` and exits
 * silently for any other mode, so non-work messages flow past this flow
 * without side effects.
 *
 * Why the mode check lives in the action, not in a flow-level `branch`:
 * the brain's switch-node evaluator (`switch-node.ts:191`) has a buggy
 * fallback that routes into the last condition when no predicate matches,
 * and the validator forbids empty `else` / `steps` arrays — so there's no
 * clean way to express a "no-op else" in the DSL today. Pushing the gate
 * into the action is simpler, cheaper to reason about, and unaffected by
 * both issues.
 *
 * The `phase` sub-value (`plan` / `edit` / `review`) is passed through so
 * the chat action can prefix a phase-aware system prompt hint.
 */
export default {
  "Claude Code": [
    on(
      "user.message",
      [[
        action("Claude Code Chat", {
          label: "chat",
          map: {
            threadId: "$.event.data.payload.threadId",
            text: "$.event.data.payload.text",
            mode: "$.event.data.payload.mode",
            phase: "$.event.data.payload.phase",
          },
        }),
      ]],
      "Work mode → Claude Code",
    ),
  ],
} satisfies FlowDSL;
