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
    // An own key only: `constructor` or `toString` is a pack's to use
    .filter(([key, value]) => Object.prototype.hasOwnProperty.call(reserved, key) || values.has(value))
    .map(([key, value]) => (key === value ? `"${key}"` : `"${key}": "${value}"`));
}
