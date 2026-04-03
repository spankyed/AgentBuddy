import type { FlowDSL } from '../types';
import { entryWithListeners, subflow } from './_patterns';

export default {
  "Root Flow": {
    root: true,
    tracks: entryWithListeners(
      [], // no entry steps, just keep_alive
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
