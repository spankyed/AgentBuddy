import { isPlainObject } from '../utils/shared.ts';

/** Canonical JSON for validated declaration data; object field order has no meaning. */
export function declarationJson(value: object): string {
  return JSON.stringify(value, (_key, item) => isPlainObject(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
}
