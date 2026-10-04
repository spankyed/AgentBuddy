// How a tRPC message is put on the wire, and why `JSON.stringify` alone is not enough.
//
// **The failure this exists for.** The ws adapter's default encoder is `JSON.stringify(data)`, and it is called
// from the async loop that drains a subscription, not from the `emit.next` that fed it. So a value it cannot
// serialise does not fail the one send: it throws inside the adapter, the subscription dies, the renderer's
// client reports `onFailed`, and the shell goes to `BACKEND_ERROR` — the fatal error page. One event carrying
// one bad value ends that window's entire event stream, and every later request times out while `/eval` and
// `/state` keep answering, so it reads as a database fault rather than a serialisation one.
//
// **What actually throws**, measured rather than assumed, because the list is shorter than it looks:
//
// | value | `JSON.stringify` |
// |---|---|
// | `BigInt`, anywhere — including a field of a class instance | **throws** `TypeError` |
// | a circular structure | **throws** `TypeError` |
// | a function, a symbol, `undefined` | silently omitted |
// | a `Map`, a `Set`, a class instance with no BigInt | `{}`, or its own enumerable fields |
//
// So only two cases need handling, and they want different answers. A BigInt has an obvious one — its decimal
// string — and a replacer reaches every one of them, however deep. A cycle has none: `JSON.stringify` throws on
// one whatever the replacer says, so it needs a second pass that cuts the loop.
//
// **Fast path first, because this runs on every outgoing message.** A chat streaming tokens goes through here
// per token, so the ordinary case must cost one `JSON.stringify` and nothing else. The replacer is free — it is
// the same single pass — and the cycle walk happens only after a throw.
//
// **So the replacer is an optimisation, not the mechanism**, which is worth saying because it looks like the
// mechanism. `withoutCycles` stringifies BigInts too, so deleting the replacer leaves every output byte
// identical and merely routes every BigInt message through a throw and a full walk. The case that notices is
// the one asserting a BigInt is sent *without* the fallback's warning; nothing else can tell the two apart.
import { createLogger } from '@abuddy/sdk/logger';

const logger = createLogger('app-events');

/** What a BigInt becomes: its decimal digits, as a string. Lossy in type, exact in value. */
const bigintsAsStrings = (_key: string, value: unknown): unknown => (typeof value === 'bigint' ? value.toString() : value);

/** What replaces the second and later sighting of the same object, so a cycle terminates */
const CIRCULAR = '[circular]';

/**
 * A copy with cycles cut and BigInts stringified, for the case the fast path threw.
 *
 * Keyed on a `WeakSet` of the objects on the current path rather than every object seen, so a value that
 * legitimately appears twice side by side is kept both times and only a genuine loop is cut.
 */
function withoutCycles(value: unknown, path: WeakSet<object>): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (value === null || typeof value !== 'object') return value;
  if (path.has(value)) return CIRCULAR;
  path.add(value);
  try {
    if (Array.isArray(value)) return value.map((entry) => withoutCycles(entry, path));
    const copy: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) copy[key] = withoutCycles(entry, path);
    return copy;
  } finally {
    path.delete(value);
  }
}

/**
 * The encoder `applyWSSHandler` is given (`experimental_encoder`), in place of its default `JSON.stringify`.
 *
 * It never throws. A message that cannot be serialised exactly is serialised approximately and reported, which
 * is the trade this makes on purpose: a window that shows one `[circular]` where it wanted an object is working,
 * and a window whose event stream is dead is not.
 */
export const jsonSafeEncoder = {
  encode: (data: unknown): string => {
    try {
      return JSON.stringify(data, bigintsAsStrings);
    } catch (error) {
      // A cycle, or something else JSON refuses even with BigInts handled. Report it once, with the message id so
      // a reader can tie it to the request, and send the approximate copy rather than killing the connection.
      const id = (data as { id?: unknown })?.id;
      logger.warn('An outgoing message needed cycles cut to be sent', {
        ...(id === undefined ? {} : { id }),
        reason: error instanceof Error ? error.message : String(error),
      });
      return JSON.stringify(withoutCycles(data, new WeakSet()), bigintsAsStrings);
    }
  },
  decode: (data: unknown): unknown => {
    if (typeof data !== 'string') throw new Error('The API speaks JSON text frames; this one carried binary data');
    return JSON.parse(data);
  },
};
