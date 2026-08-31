import type { FlowDSL } from '../types';
import { entry, on, keepAlive, subflow } from './_patterns';

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
        "onboarding.start",
        [[subflow("Onboarding Flow", { label: "run onboarding" })]],
        "Start Onboarding",
      ),
    ],
  },
} satisfies FlowDSL;
