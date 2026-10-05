// Bounds what a step records on its TNode, so a large result can't grow memory without limit. A
// truncated value becomes `{ value, _truncated: true, ... }` describing what was cut.
//
// What it produces is written to the TNode (`@abuddy/sdk/repositories`' `tnodeRepository`), so it has to be a
// value JSON can hold: a BigInt becomes its digits and a loop is cut where it closes. Neither may fail the
// result — a step's row is the only record of what it returned.

const MAX_STRING_LENGTH = 10240;  // 10KB for string values
const MAX_OBJECT_SIZE = 51200;    // 50KB for serialized objects
const MAX_ARRAY_ITEMS = 100;      // Array items kept
const MAX_OBJECT_KEYS = 20;       // Keys kept of an object over MAX_OBJECT_SIZE
const MAX_DEPTH = 10;             // Object nesting kept

/** Where a loop closes, cut in place so the rest of the value survives it */
const CIRCULAR = '[Circular]';

/** A field that threw when it was read. A getter may, and one field is not worth the whole row. */
const UNREADABLE = '[Unreadable]';

/**
 * The serialised size of `record`, for deciding whether its keys have to be cut.
 *
 * An estimate rather than the output, which is why it may cut corners the walk below does not: it counts a
 * BigInt as its digits and a repeated object once. **It must not throw.** `JSON.stringify` does on a BigInt or
 * a loop, and measuring with a bare one is what used to discard the whole result and persist
 * `_error: 'serialization_failed'` to the TNode in place of the row.
 */
/** A replacer that counts a BigInt as its digits and a repeated object once. Stateful, so one per pass. */
function sizeReplacer(): (key: string, value: unknown) => unknown {
  const seen = new WeakSet<object>();
  return (_key, value) => {
    if (typeof value === 'bigint') return value.toString();
    if (value !== null && typeof value === 'object') {
      if (seen.has(value)) return undefined;
      seen.add(value);
    }
    return value;
  };
}

function serialisedSize(record: object): number {
  try {
    return JSON.stringify(record, sizeReplacer())?.length ?? 0;
  } catch {
    // A field that throws when it is read, which `JSON.stringify` reaches before any size is known. Measured
    // field by field instead rather than answered as 0: the size bound is the reason this function exists, and
    // calling an unmeasurable object small would keep every key of one of any size.
    return readableFieldsSize(record);
  }
}

/** The size of the fields that can be read, for an object one hostile field made unmeasurable as a whole */
function readableFieldsSize(record: object): number {
  let total = 0;
  for (const key of Object.keys(record)) {
    const field = readField(record as Record<string, unknown>, key);
    if (!field) continue;
    try {
      total += JSON.stringify(field.value, sizeReplacer())?.length ?? 0;
    } catch {
      // A field whose own contents throw deeper down, or a loop a per-field pass cannot see. Counted as
      // nothing, which understates the size by one field rather than losing the bound for the whole row.
    }
  }
  return total;
}

/**
 * `read()`'s result, or nothing when it throws. Only the read is wrapped, never the walk, so a bug in the walk
 * still surfaces instead of becoming a marker on every field.
 */
function readFrom(read: () => unknown): { value: unknown } | undefined {
  try {
    return { value: read() };
  } catch {
    return undefined;
  }
}

/** `record[key]`, or nothing when reading it throws — a getter may */
const readField = (record: Record<string, unknown>, key: string) => readFrom(() => record[key]);

/** `result` with long strings, long arrays, large objects and deep nesting cut, each cut marked `_truncated` */
export function truncateResult(result: unknown, depth = 0): unknown {
  return walk(result, depth, new WeakSet());
}

/**
 * `path` holds the objects between the root and here, so a value that reaches itself is cut where it closes
 * rather than expanded until the depth cap stops it. An object merely reached twice is kept twice, as
 * `redactSecrets` does and unlike the size estimate above, because the two are answering different questions.
 */
function walk(result: unknown, depth: number, path: WeakSet<object>): unknown {
  if (depth > MAX_DEPTH) {
    return { value: '[Max depth exceeded]', _truncated: true, _type: typeof result };
  }
  if (result === null || result === undefined) return result;

  // JSON has no form for one, and this value is about to be stored as JSON
  if (typeof result === 'bigint') return result.toString();

  if (typeof result === 'string') {
    if (result.length <= MAX_STRING_LENGTH) return result;
    // At a word boundary when there's one near the limit
    const lastSpace = result.lastIndexOf(' ', MAX_STRING_LENGTH);
    const truncateAt = lastSpace > MAX_STRING_LENGTH * 0.8 ? lastSpace : MAX_STRING_LENGTH;
    return { value: result.substring(0, truncateAt) + '...', _truncated: true, _originalLength: result.length, _type: 'string' };
  }

  if (Array.isArray(result)) {
    if (path.has(result)) return CIRCULAR;
    path.add(result);
    try {
      if (result.length <= MAX_ARRAY_ITEMS) return result.map((item) => walk(item, depth + 1, path));
      return {
        value: result.slice(0, MAX_ARRAY_ITEMS).map((item) => walk(item, depth + 1, path)),
        _truncated: true,
        _originalLength: result.length,
        _type: 'array',
      };
    } finally {
      path.delete(result);
    }
  }

  if (typeof result === 'object') {
    const record = result as Record<string, unknown>;
    if (path.has(record)) return CIRCULAR;
    // A value that describes itself is asked, as `JSON.stringify` asks: walking a Date's own enumerable
    // properties finds none, so it persisted as `{}` and a step's timestamps were lost. The other four passes
    // all keep one, three of them by going through `JSON.stringify`.
    const described = record as { toJSON?: (key?: string) => unknown };
    if (typeof described.toJSON === 'function') {
      const described0 = readFrom(() => described.toJSON?.(''));
      return described0 ? walk(described0.value, depth, path) : UNREADABLE;
    }
    const size = serialisedSize(record);
    const keys = Object.keys(record);
    const kept = size <= MAX_OBJECT_SIZE ? keys : keys.slice(0, MAX_OBJECT_KEYS);
    path.add(record);
    try {
      const truncated: Record<string, unknown> = {};
      for (const key of kept) {
        const field = readField(record, key);
        truncated[key] = field ? walk(field.value, depth + 1, path) : UNREADABLE;
      }
      if (size <= MAX_OBJECT_SIZE) return truncated;
      return { value: truncated, _truncated: true, _originalSize: size, _originalKeys: keys.length, _type: 'object' };
    } finally {
      path.delete(record);
    }
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
