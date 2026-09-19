// Bounds what a step records on its TNode, so a large result can't grow memory without limit. A
// truncated value becomes `{ value, _truncated: true, ... }` describing what was cut.

const MAX_STRING_LENGTH = 10240;  // 10KB for string values
const MAX_OBJECT_SIZE = 51200;    // 50KB for serialized objects
const MAX_ARRAY_ITEMS = 100;      // Array items kept
const MAX_OBJECT_KEYS = 20;       // Keys kept of an object over MAX_OBJECT_SIZE
const MAX_DEPTH = 10;             // Object nesting kept

/** `result` with long strings, long arrays, large objects and deep nesting cut, each cut marked `_truncated` */
export function truncateResult(result: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) {
    return { value: '[Max depth exceeded]', _truncated: true, _type: typeof result };
  }
  if (result === null || result === undefined) return result;

  if (typeof result === 'string') {
    if (result.length <= MAX_STRING_LENGTH) return result;
    // At a word boundary when there's one near the limit
    const lastSpace = result.lastIndexOf(' ', MAX_STRING_LENGTH);
    const truncateAt = lastSpace > MAX_STRING_LENGTH * 0.8 ? lastSpace : MAX_STRING_LENGTH;
    return { value: result.substring(0, truncateAt) + '...', _truncated: true, _originalLength: result.length, _type: 'string' };
  }

  if (Array.isArray(result)) {
    if (result.length <= MAX_ARRAY_ITEMS) return result.map((item) => truncateResult(item, depth + 1));
    return {
      value: result.slice(0, MAX_ARRAY_ITEMS).map((item) => truncateResult(item, depth + 1)),
      _truncated: true,
      _originalLength: result.length,
      _type: 'array',
    };
  }

  if (typeof result === 'object') {
    const record = result as Record<string, unknown>;
    let serialized: string;
    try {
      serialized = JSON.stringify(record);
    } catch {
      // Circular references, or a value JSON can't hold
      return { value: '[Object with circular reference]', _truncated: true, _error: 'serialization_failed', _type: 'object' };
    }
    const keys = Object.keys(record);
    const kept = serialized.length <= MAX_OBJECT_SIZE ? keys : keys.slice(0, MAX_OBJECT_KEYS);
    const truncated: Record<string, unknown> = {};
    for (const key of kept) truncated[key] = truncateResult(record[key], depth + 1);
    if (serialized.length <= MAX_OBJECT_SIZE) return truncated;
    return { value: truncated, _truncated: true, _originalSize: serialized.length, _originalKeys: keys.length, _type: 'object' };
  }

  return result;
}

/** A value `truncateResult` cut */
export interface TruncatedResult {
  value: unknown;
  _truncated: true;
  _type: string;
}

/** Whether `truncateResult` cut this value */
export function isTruncated(result: unknown): result is TruncatedResult {
  return typeof result === 'object' && result !== null && (result as { _truncated?: unknown })._truncated === true;
}
