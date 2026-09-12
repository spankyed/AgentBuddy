export function expandRecord(
  map: Record<string, string> | undefined,
  keyField = 'target',
  valueField = 'source',
): Array<Record<string, string>> | undefined {
  if (!map) return undefined;
  return Object.entries(map).map(([k, v]) => ({ [keyField]: k, [valueField]: v }));
}

export function collapseRecord(
  entries: Array<Record<string, string>> | undefined,
  keyField = 'target',
  valueField = 'source',
): Record<string, string> | undefined {
  if (!entries || entries.length === 0) return undefined;
  const map: Record<string, string> = {};
  for (const entry of entries) {
    map[entry[keyField]] = entry[valueField];
  }
  return map;
}
