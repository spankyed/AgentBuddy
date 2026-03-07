import type { FlowDSL } from '../types';
import { modeTracks, subflow } from './_patterns';

export default {
  "Root Flow": {
    root: true,
    tracks: modeTracks(
      [], // no entry steps, just keep_alive
      [
        {
          event: "tour.complete",
          label: "Start Onboarding",
          steps: [subflow("Onboarding Flow", { label: "run onboarding" })],
        },
      ],
    ),
  },
} satisfies FlowDSL;
