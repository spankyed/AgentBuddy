import { pathToFileURL } from 'url';

export async function loadSettingsFromFile(settingsPath: string): Promise<Record<string, unknown>> {
  const mod = await import(pathToFileURL(settingsPath).href);
  return mod.default;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

export function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const current = result[key];
    const incoming = source[key];
    if (isRecord(current) && isRecord(incoming)) {
      result[key] = deepMerge(current, incoming);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}
