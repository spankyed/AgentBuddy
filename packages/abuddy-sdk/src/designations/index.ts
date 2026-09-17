// Roles packs designate a feature for (abuddy.json `features[].designation`), resolved in the registered packs:
// getDesignated gives the id of the system (in the renderer, the plugin) that plays a role, and throws when none does
import { boundPackContributions } from '../runtime/packs-view.ts';

/** Role → id of the system or plugin that plays it */
export type Designations = Record<string, string>;

export function getDesignated(role: string): string {
  const id = boundPackContributions().designation(role);
  if (!id) throw new Error(`No feature designated for "${role}". Ensure a pack declares this designation.`);
  return id;
}

export function hasDesignation(role: string): boolean {
  return boundPackContributions().designation(role) !== undefined;
}
