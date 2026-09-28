import type { FieldMapping } from './types.ts';

/** What a step's `map` may say about one field: a source, or a source with a fallback */
export type MapEntry = string | { source: string; default?: unknown };

/**
 * A step's `map` as the mappings the runtime applies.
 *
 * Two forms, because a fallback is worth syntax and nothing else is: `field: '$.path'` is the common case and
 * stays one line, `field: { source, default }` adds the value to use when the source resolves to nothing.
 */
export function expandRecord(map: Record<string, MapEntry> | undefined): FieldMapping[] | undefined {
  if (!map) return undefined;
  return Object.entries(map).map(([target, entry]) => (typeof entry === 'string'
    ? { target, source: entry }
    : { target, source: entry.source, ...(entry.default === undefined ? {} : { default: entry.default }) }));
}

/**
 * The reverse, writing the short form unless there is a fallback to carry.
 *
 * Lossless in both directions, which it was not: it read two fields and dropped everything else, so a mapping
 * with a `default` came back without one and the flow a user exported was not the flow they had.
 */
export function collapseRecord(entries: FieldMapping[] | undefined): Record<string, MapEntry> | undefined {
  if (!entries || entries.length === 0) return undefined;
  const map: Record<string, MapEntry> = {};
  for (const { target, source, default: fallback } of entries) {
    map[target] = fallback === undefined ? source : { source, default: fallback };
  }
  return map;
}

/** `file:line`-free problems with a step's `map`, for the steps that take one */
export function mapProblems(map: unknown, path: string): Array<{ path: string; message: string }> {
  if (map === undefined) return [];
  if (typeof map !== 'object' || map === null || Array.isArray(map)) {
    return [{ path, message: '"map" must be an object { target: source }' }];
  }
  const problems: Array<{ path: string; message: string }> = [];
  for (const [key, entry] of Object.entries(map as Record<string, unknown>)) {
    if (typeof entry === 'string') continue;
    // The long form, which is what a `default` needs. Checked rather than cast: `expandRecord` would otherwise
    // put the whole object in `source`, and the runtime returns an unparseable source as a literal — so the
    // natural guess at this syntax used to produce a mapping whose value was the object the author wrote
    if (typeof entry === 'object' && entry !== null && !Array.isArray(entry)
      && typeof (entry as { source?: unknown }).source === 'string') continue;
    problems.push({
      path: `${path}.${key}`,
      message: 'a "map" entry must be a source string, or { source, default } to give a fallback',
    });
  }
  return problems;
}
