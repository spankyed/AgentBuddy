/**
 * Utilities for handling settings changes with renames and removals
 */

export type Rename = { from: string; to: string };
export type ChangeBlock = { renames?: Rename[]; removed?: Array<{ name: string } | string> };

/**
 * Convert rename array to a Map for efficient lookups
 */
export const toMap = (r?: Rename[]) =>
  new Map<string, string>(r?.map(({ from, to }) => [from, to]) ?? []);

/**
 * Convert removed items to a Set of names for efficient lookups
 */
export const toNameSet = (r?: ChangeBlock['removed']) =>
  new Set<string>((r ?? []).map(x => (typeof x === 'string' ? x : x.name)));

/**
 * Map a scalar field by renames/removals; return updated value or original if unchanged.
 * @param val - Current value
 * @param renames - Map of old names to new names
 * @param removed - Set of removed names
 * @param fallback - Function to provide fallback value when item is removed
 */
export const mapScalar = (
  val: string | undefined,
  renames: Map<string, string>,
  removed: Set<string>,
  fallback: () => string | undefined
): string | undefined => {
  if (!val) return val;
  const renamed = renames.get(val);
  if (renamed) return renamed;
  if (removed.has(val)) return fallback();
  return val;
};

/**
 * Map a string array field by renames/removals; returns new array and whether it changed.
 * @param vals - Current array of values
 * @param renames - Map of old names to new names
 * @param removed - Set of removed names
 */
export const mapArray = (
  vals: string[] | undefined,
  renames: Map<string, string>,
  removed: Set<string>
): { next: string[]; changed: boolean } => {
  if (!vals?.length) return { next: vals ?? [], changed: false };
  let changed = false;
  const next = vals
    .map(v => {
      if (removed.has(v)) {
        changed = true;
        return null;
      }
      const n = renames.get(v);
      if (n && n !== v) {
        changed = true;
        return n;
      }
      return v;
    })
    .filter(Boolean) as string[];
  return { next, changed };
};