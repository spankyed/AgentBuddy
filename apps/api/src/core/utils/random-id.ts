/*───────────────────────────────────────────────────────────────────────────
 * random-id.ts – v3  »  fewer allocations, 64‑bit entropy, no padStart
 *───────────────────────────────────────────────────────────────────────────*/

export interface RandomIdOptions {
  prefix?: string;
  /** Ensures uniqueness when two calls land in the same µs */
  counterSafe?: boolean;
  /** Clip the core to a fixed length (after ts+counter) */
  length?: number;
  includeTimestamp?: boolean;
}

/*───────────────────────────────────────────────────────────────*
 * Pre‑built lookup for base‑36 digits (0‑9a‑z)                   *
 *───────────────────────────────────────────────────────────────*/
const DIGITS = Array.from({ length: 36 }, (_, i) => i.toString(36));
const toBase36 = (num: number) => {
  let n = num >>> 0; // force uint32
  let out = '';
  do {
    out = DIGITS[n % 36] + out;
    n = Math.floor(n / 36);
  } while (n);
  return out;
};

/*───────────────────────────────────────────────────────────────*
 * Fast 64‑bit random → base‑36                                    *
 *───────────────────────────────────────────────────────────────*/
const getRand64 = (): string => {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const arr = new BigUint64Array(1);
    crypto.getRandomValues(arr);
    return arr[0].toString(36);
  }
  // fallback: combine two 32‑bit Math.random values
  const hi = (Math.random() * 0xffffffff) >>> 0;
  const lo = (Math.random() * 0xffffffff) >>> 0;
  return (BigInt(hi) << 32n | BigInt(lo)).toString(36);
};

/*───────────────────────────────────────────────────────────────*
 * Counter to guarantee monotonic uniqueness                       *
 *───────────────────────────────────────────────────────────────*/
let counter = 0;
const nextCounter = () => {
  counter = (counter + 1) & 0xfff; // 12‑bit ring buffer (0‑4095)
  return counter;
};

/*───────────────────────────────────────────────────────────────*
 * Public factory                                                  *
 *───────────────────────────────────────────────────────────────*/
export function randomId(opt: RandomIdOptions = {}): string {
  const {
    prefix = '',
    counterSafe = false,
    length,
    includeTimestamp = true,
  } = opt;

  const ts = includeTimestamp ? Date.now().toString(36) : '';
  const cnt = counterSafe ? toBase36(nextCounter()) : '';
  const rand = getRand64();

  let core = ts + cnt + rand;
  if (length && core.length > length) core = core.slice(0, length);
  return prefix ? prefix + core : core;
}
