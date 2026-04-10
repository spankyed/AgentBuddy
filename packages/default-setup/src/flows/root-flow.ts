import type { FlowDSL } from '../types';
import { entryWithListeners, subflow } from './_patterns';

export default {
  "Root Flow": {
    root: true,
    tracks: entryWithListeners(
      [
        subflow("Command Listener", { label: "start command listener" }),
        subflow("Claude Code", { label: "start claude code work mode" }),
      ],
      [
        {
          event: "tour.complete",
          label: "Start Onboarding",
          exits: [[subflow("Onboarding Flow", { label: "run onboarding" })]],
        },
      ],
    ),
  },
} satisfies FlowDSL;
