export interface RandomIdOptions {
  prefix?: string;
  counterSafe?: boolean;
  length?: number;
  includeTimestamp?: boolean;
}

const DIGITS = Array.from({ length: 36 }, (_, i) => i.toString(36));
const toBase36 = (num: number) => {
  let n = num >>> 0;
  let out = '';
  do { out = DIGITS[n % 36] + out; n = Math.floor(n / 36); } while (n);
  return out;
};

const getRand64 = (): string => {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const arr = new BigUint64Array(1);
    crypto.getRandomValues(arr);
    return arr[0].toString(36);
  }
  const hi = (Math.random() * 0xffffffff) >>> 0;
  const lo = (Math.random() * 0xffffffff) >>> 0;
  return (BigInt(hi) << 32n | BigInt(lo)).toString(36);
};

let counter = 0;
const nextCounter = () => { counter = (counter + 1) & 0xfff; return counter; };

export function randomId(opt: RandomIdOptions = {}): string {
  const { prefix = '', counterSafe = false, length, includeTimestamp = true } = opt;
  const ts = includeTimestamp ? Date.now().toString(36) : '';
  const cnt = counterSafe ? toBase36(nextCounter()) : '';
  const rand = getRand64();
  let core = ts + cnt + rand;
  if (length && core.length > length) core = core.slice(0, length);
  return prefix ? prefix + core : core;
}
