import type { FlowDSL } from '../types';
import { entryTrack, branch, modeTracks, action, fire, subflow } from './_patterns';

export default {
  /** Linear: entry → action → fire */
  "Analysis Flow": [
    entryTrack([
      action("Analyze Text", { label: "analyze" }),
      fire("analysis.complete", { label: "notify" }),
    ]),
  ],

  /** Branching: action → switch → per-branch steps */
  "Support Flow": [
    entryTrack([
      action("Analyze Text", { label: "classify" }),
      branch(
        [
          { if: "$.intent == 'question'", steps: [
            action("db query", { label: "lookup" }),
          ]},
          { if: "$.intent == 'request'", steps: [
            action("Create Birth Thread", { label: "onboard" }),
          ]},
        ],
        [fire("support.escalated", { label: "escalate" })],
      ),
    ]),
  ],

  /** Long-running: entry with keep_alive + multiple event listeners */
  "Monitor Flow": modeTracks(
    [action("Analyze Text", { label: "init" })],
    [
      { event: "user.message", label: "Handle Message", steps: [
        action("db query", { label: "process" }),
        fire("message.processed"),
      ]},
      { event: "user.disconnect", label: "Handle Disconnect", steps: [
        fire("session.ended", { label: "end" }),
      ]},
    ],
  ),
} satisfies FlowDSL;
