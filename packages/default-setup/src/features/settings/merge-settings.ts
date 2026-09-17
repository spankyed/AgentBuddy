// How settings layer: the default settings, each feature's settings over them, and the user's stored changes over those
const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** `over` on `base`: objects merge key by key, an undefined value keeps the base's, anything else replaces it */
export function mergeSettings<T>(base: T, over: unknown): T {
  if (over === undefined) return base;
  if (!isRecord(base) || !isRecord(over)) return over as T;
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(over)) result[key] = mergeSettings(base[key], value);
  return result as T;
}
