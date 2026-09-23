// The settings sections this pack owns, beside the `plugins` section the app keeps itself. The app stores, merges
// and diffs them without knowing their shape; what is in them is this pack's (`be/types.ts`).
//
// Read the first time the app reads the defaults, not at registration, because they come from this pack's compiled
// seed (`settings.seed.json`) — which exists only after `abuddy build`.
import { getBaseSettings } from './be/defaults';

/** `general` (the user, the app's hotkeys, their projects) and `assistant` (its name and birthdate) */
export function settingsSections(): Record<string, unknown> {
  const { general, assistant } = getBaseSettings();
  return { general, assistant };
}
