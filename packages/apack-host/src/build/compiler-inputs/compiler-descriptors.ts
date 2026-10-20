import fs from 'node:fs';
import type { FileHandle } from 'node:fs/promises';

interface DescriptorOwner {
  readStats(args: readonly unknown[]): unknown;
}
interface CapturedDescriptor {
  owner: DescriptorOwner;
  dev: bigint;
  ino: bigint;
}
const descriptors = new Map<number, CapturedDescriptor>();
const nativeStat = fs.fstatSync;

export function capturedDescriptor(fd: number) { return descriptors.get(fd); }
export function releaseDescriptor(fd: number, expected: CapturedDescriptor | undefined) {
  if (descriptors.get(fd) === expected) descriptors.delete(fd);
}

export function rememberDescriptor(fd: number, owner?: DescriptorOwner) {
  descriptors.delete(fd);
  if (owner) {
    const { dev, ino } = nativeStat(fd, { bigint: true });
    descriptors.set(fd, { owner, dev, ino });
  }
}

/** Validate the actual descriptor before projecting its captured source metadata. */
export function descriptorStats(fd: number, actual: fs.Stats | fs.BigIntStats, args: readonly unknown[], captured: CapturedDescriptor | undefined) {
  if (!captured) return actual;
  const same = typeof actual.ino === 'bigint'
    ? actual.ino === captured.ino && actual.dev === captured.dev
    : actual.ino === Number(captured.ino) && actual.dev === Number(captured.dev);
  if (!same) { releaseDescriptor(fd, captured); return actual; }
  return captured.owner.readStats(args);
}

/** Keep native handle identity, brand checks, closure and invalid-descriptor errors. */
export function instrumentFileHandle(handle: FileHandle) {
  const stat = handle.stat, close = handle.close;
  handle.stat = (async function(this: FileHandle, ...args: unknown[]) {
    const fd = this?.fd, captured = descriptors.get(fd);
    const actual = await Reflect.apply(stat, this, args);
    return descriptorStats(fd, actual, args, captured);
  }) as typeof handle.stat;
  handle.close = (async function(this: FileHandle, ...args: unknown[]) {
    const fd = handle.fd, captured = descriptors.get(fd);
    try { return await Reflect.apply(close, this, args); }
    finally { if (handle.fd < 0) releaseDescriptor(fd, captured); }
  }) as typeof handle.close;
  return handle;
}
