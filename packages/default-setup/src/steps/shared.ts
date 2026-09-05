export function expandFieldMappings(map?: Record<string, string>): Array<{ target: string; source: string }> | undefined {
  if (!map) return undefined;
  return Object.entries(map).map(([target, source]) => ({ target, source }));
}

export function collapseFieldMappings(
  fieldMappings?: Array<{ target: string; source: string }>
): Record<string, string> | undefined {
  if (!fieldMappings || fieldMappings.length === 0) return undefined;
  const map: Record<string, string> = {};
  for (const { target, source } of fieldMappings) {
    map[target] = source;
  }
  return map;
}
