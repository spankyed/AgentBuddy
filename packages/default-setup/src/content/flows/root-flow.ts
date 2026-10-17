import type { FlowDSL } from '@apackdev/sdk/build';
import { entry, on, keepAlive, subflow, action, branch } from '#generated/flow-helpers.ts';

export default {
  "Root Flow": {
    root: true,
    tracks: [
      entry(
        // Long-running subflows: each spawns independently on flow.entry.
        [subflow("Command Listener", { label: "start command listener" })],
        [subflow("Claude Code", { label: "start claude code work mode" })],
        [subflow("Codex", { label: "start codex work mode" })],
        // Dedicated wedge: keeps the root flow alive for listener tracks.
        // The subflow branches above are already long-running in practice,
        // but an explicit keep_alive branch is the honest way to say
        // "stay alive" without relying on that implementation detail.
        [keepAlive()],
      ),
      on(
        "client.ready",
        [[
          action("Check Onboarding", { label: "check onboarding" }),
          branch([{ if: "$.lastStep.result.needed", steps: [subflow("Onboarding Flow", { label: "run onboarding" })] }]),
        ]],
        "Client Ready",
      ),
    ],
  },
} satisfies FlowDSL;
