import type { FlowDSL } from '../types';
import { entryTrack, classifyAndBranch, modeTracks } from './_patterns';

export default {
  "Greeting Flow": [
    entryTrack([
      { type: "action", action: "greet_user", label: "greet" },
      { type: "fire", event: "greeting.sent", label: "notify" },
    ]),
  ],

  "Support Flow": [
    entryTrack(
      classifyAndBranch(
        "classify_intent",
        [
          { if: "$.intent == 'billing'", steps: [
            { type: "flow", flow: "Billing Flow", label: "handle billing" },
          ]},
          { if: "$.intent == 'technical'", steps: [
            { type: "flow", flow: "Tech Support Flow", label: "handle tech" },
          ]},
        ],
        [{ type: "action", action: "escalate_to_human", label: "escalate" }],
      ),
    ),
  ],

  "Monitor Flow": modeTracks(
    [{ type: "action", action: "initialize_monitor", label: "init" }],
    [
      { event: "user.message", label: "Handle Message", steps: [
        { type: "action", action: "process_message", label: "process" },
      ]},
      { event: "user.disconnect", label: "Handle Disconnect", steps: [
        { type: "action", action: "cleanup", label: "cleanup" },
      ]},
    ],
  ),
} satisfies FlowDSL;
