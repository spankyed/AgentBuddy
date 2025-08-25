/**
 * Utilities for handling settings changes with renames and removals
 */

export type Rename = { from: string; to: string };
export type ChangeBlock<T = any> = { 
  renames?: Rename[]; 
  removed?: Array<T | string> 
};

/**
 * Convert rename array to a Map for efficient lookups
 */
export const toMap = (r?: Rename[]) =>
  new Map<string, string>(r?.map(({ from, to }) => [from, to]) ?? []);

/**
 * Convert removed items to a Set of identifiers for efficient lookups
 * @param removed - Array of removed items (strings or objects)
 * @param keyExtractor - Function to extract the identifier from objects (defaults to 'name' property)
 */
export const toIdentifierSet = <T = any>(
  removed?: Array<T | string>,
  keyExtractor: (item: T) => string = (item: any) => item.name
) =>
  new Set<string>((removed ?? []).map(x => 
    typeof x === 'string' ? x : keyExtractor(x as T)
  ));

/**
 * @deprecated Use toIdentifierSet instead - this is kept for backward compatibility
 */
export const toNameSet = (r?: ChangeBlock['removed']) => 
  toIdentifierSet(r);

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
  fallback?: () => string | undefined
): string | undefined => {
  if (!val) return val;
  const renamed = renames.get(val);
  if (renamed) return renamed;
  if (removed.has(val)) return fallback?.();
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