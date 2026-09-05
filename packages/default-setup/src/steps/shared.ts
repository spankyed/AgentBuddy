export function expandFieldMappings(map?: Record<string, string>): Array<{ target: string; source: string }> | undefined {
  if (!map) return undefined;
  return Object.entries(map).map(([target, source]) => ({ target, source }));
}
