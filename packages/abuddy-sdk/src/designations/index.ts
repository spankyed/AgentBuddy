// Roles packs designate a feature for (abuddy.json `features[].designation`), resolved in the registered packs:
// getDesignated gives the id that addresses the feature playing a role in this process: its system on the
// backend, its own feature id when it has no system, its plugin in the renderer. It throws when no
// registered pack declares the role.
//
// A designation is a role, not a name: `features[].designation` in abuddy.json need not equal the feature
// id, and a pack may name one feature `inbox` and have it play `notes`.
import { _boundPackExtensions } from '../runtime/packs-view.ts';

/** Role → id of the system or plugin that plays it */
export type Designations = Record<string, string>;

export function getDesignated(role: string): string {
  const id = _boundPackExtensions().designation(role);
  if (!id) throw new Error(`No feature designated for "${role}". Ensure a pack declares this designation.`);
  return id;
}

export function hasDesignation(role: string): boolean {
  return _boundPackExtensions().designation(role) !== undefined;
}
