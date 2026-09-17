export const isPlainObject = (val: unknown): val is Record<string, unknown> =>
  typeof val === 'object' && val !== null && !Array.isArray(val);

const random64 = (): string => {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const arr = new BigUint64Array(1);
    crypto.getRandomValues(arr);
    return arr[0].toString(36);
  }
  const hi = (Math.random() * 0xffffffff) >>> 0;
  const lo = (Math.random() * 0xffffffff) >>> 0;
  return (BigInt(hi) << 32n | BigInt(lo)).toString(36);
};

/** A new entity id's suffix: a base-36 timestamp and 64 random bits */
export function idSuffix(): string {
  return Date.now().toString(36) + random64();
}
