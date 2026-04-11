import type { FlowDSL } from '../types';
import { entryWithListeners, subflow } from './_patterns';

export default {
  "Root Flow": {
    root: true,
    tracks: entryWithListeners(
      [subflow("Command Listener", { label: "start command listener" })],
      [
        {
          event: "tour.complete",
          label: "Start Onboarding",
          exits: [[subflow("Onboarding Flow", { label: "run onboarding" })]],
        },
        {
          // Threads system fires this when a thread is created with
          // forcedMode='claude-code'. The sub-flow handles the whole
          // session lifecycle from there.
          event: "claude.code.session.start",
          label: "Start Claude Code Session",
          exits: [[subflow("Claude Code Session", { label: "run cc session" })]],
        },
      ],
    ),
  },
} satisfies FlowDSL;
