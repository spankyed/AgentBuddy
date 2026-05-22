/**
 * Utilities for handling settings changes with renames and removals.
 * Extracted from systems/settings/ so multiple systems can use these
 * without cross-system imports.
 */

export type Rename = { from: string; to: string };
export type ChangeBlock<T = any> = {
  renames?: Rename[];
  removed?: Array<T | string>
};

export const toMap = (r?: Rename[]) =>
  new Map<string, string>(r?.map(({ from, to }) => [from, to]) ?? []);

export const toIdentifierSet = <T = any>(
  removed?: Array<T | string>,
  keyExtractor: (item: T) => string = (item: any) => item.name
) =>
  new Set<string>((removed ?? []).map(x =>
    typeof x === 'string' ? x : keyExtractor(x as T)
  ));

/** @deprecated Use toIdentifierSet instead */
export const toNameSet = (r?: ChangeBlock['removed']) =>
  toIdentifierSet(r);

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
