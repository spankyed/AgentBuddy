// The one rule for EARS names a pack may not declare, shared by the manifest schema, the code generator and
// the host's registry
/**
 * The entries of `declared` (a pack's `entities` or `relKinds`) that use a name `reserved` owns: its key or
 * its value. Each is written as it appears in abuddy.json (`"Flow"`, or `"Run": "TNode"` when they differ).
 *
 * @internal
 */
export function reservedEntries(declared: Record<string, string>, reserved: Record<string, string>): string[] {
  const values = new Set(Object.values(reserved));
  return Object.entries(declared)
    .filter(([key, value]) => Object.hasOwn(reserved, key) || values.has(value))
    .map(([key, value]) => (key === value ? `"${key}"` : `"${key}": "${value}"`));
}
