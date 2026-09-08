import type { FlowDSL } from '../types';
import { entry, on, keepAlive, flow } from '#generated/flow-helpers';

export default {
  "Root Flow": {
    root: true,
    tracks: [
      entry(
        // Long-running flows: each spawns independently on flow.entry.
        [flow("Command Listener", { label: "start command listener" })],
        [flow("Claude Code", { label: "start claude code work mode" })],
        [flow("Codex", { label: "start codex work mode" })],
        // Dedicated wedge: keeps the root flow alive for listener tracks.
        // The flow branches above are already long-running in practice,
        // but an explicit keep_alive branch is the honest way to say
        // "stay alive" without relying on that implementation detail.
        [keepAlive()],
      ),
      on(
        "onboarding.start",
        [[flow("Onboarding Flow", { label: "run onboarding" })]],
        "Start Onboarding",
      ),
    ],
  },
} satisfies FlowDSL;
