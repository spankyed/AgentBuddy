export interface ElfCachedLibrary {
  readonly name: string;
  readonly file: string;
  readonly flags: number;
  readonly hardwareCapability?: string;
  readonly isaLevel: number;
}

/** Read the OS cache ABI; this is not an apack-authored format or executable inspection tool. */
export function parseElfLibraryCache(bytes: Buffer, littleEndian: boolean): ElfCachedLibrary[] {
  const invalid = () => new Error('Invalid ELF operating-system library cache');
  const range = (offset: number, size: number) => {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(size) || offset < 0 || size < 0
      || offset > bytes.length || size > bytes.length - offset) throw invalid();
  };
  const uint = (offset: number) => { range(offset, 4); return littleEndian ? bytes.readUInt32LE(offset) : bytes.readUInt32BE(offset); };
  const magic = (offset: number) => bytes.toString('ascii', offset, offset + 20) === 'glibc-ld.so.cache1.1';
  let base = 0;
  if (bytes.toString('ascii', 0, 11) === 'ld.so-1.7.0') {
    base = Math.ceil((16 + uint(12) * 12) / 8) * 8;
    range(16, uint(12) * 12);
  }
  const modern = magic(base);
  if (!modern && base === 0 && bytes.toString('ascii', 0, 11) !== 'ld.so-1.7.0') throw invalid();
  // A combined cache puts the newer header after the first table; an original-format cache has none.
  if (!modern) base = 0;
  const actualCount = uint(base + (modern ? 20 : 12)), header = modern ? 48 : 16, entry = modern ? 24 : 12;
  range(base, header + actualCount * entry);
  const strings = base + header + actualCount * entry;
  const stringSize = modern ? uint(base + 24) : bytes.length - strings;
  range(strings, stringSize);
  if (modern) {
    const endian = bytes[base + 28] & 3;
    if (endian && endian !== (littleEndian ? 2 : 3)) throw invalid();
  }
  const string = (offset: number) => {
    if (offset < strings || offset >= strings + stringSize) throw invalid();
    const end = bytes.indexOf(0, offset);
    if (end < 0 || end >= strings + stringSize) throw invalid();
    return bytes.toString('utf8', offset, end);
  };
  const capabilities: string[] = [];
  const extension = modern ? uint(base + 32) : 0;
  if (extension) {
    range(extension, 8);
    if (extension % 4 || uint(extension) !== 0x100000000 - 358342284) throw invalid();
    const count = uint(extension + 4);
    range(extension + 8, count * 16);
    for (let i = 0; i < count; i++) {
      const at = extension + 8 + i * 16;
      if (uint(at) !== 1) continue;
      const offset = uint(at + 8), size = uint(at + 12);
      if (offset % 4 || size % 4 || capabilities.length) throw invalid();
      range(offset, size);
      for (let at = offset; at < offset + size; at += 4) capabilities.push(string(uint(at)));
    }
  }
  const result: ElfCachedLibrary[] = [];
  for (let i = 0; i < actualCount; i++) {
    const at = base + header + i * entry;
    const name = string((modern ? base : strings) + uint(at + 4));
    const file = string((modern ? base : strings) + uint(at + 8));
    const hwcap = modern ? littleEndian ? bytes.readBigUInt64LE(at + 16) : bytes.readBigUInt64BE(at + 16) : 0n;
    const upper = Number(hwcap >> 32n), named = (upper & ~0x3ff) === 0x40000000;
    // glibc 2.37+ ignores entries from the superseded platform-mask mechanism.
    if (hwcap !== 0n && !named) continue;
    const capability = named ? capabilities[Number(hwcap & 0xffffffffn)] : undefined;
    if (named && capability === undefined) continue;
    result.push({ name, file, flags: uint(at), hardwareCapability: capability, isaLevel: upper & 0x3ff });
  }
  return result;
}

export function findElfCachedLibrary(entries: readonly ElfCachedLibrary[], name: string, machine: number,
  capabilities: readonly string[], isaLevels: number): string | undefined {
  const flags = machine === 62 ? 0x303 : machine === 183 ? 0xa03 : machine === 3 ? 3 : undefined;
  if (flags === undefined) throw new Error(`Cannot select ELF library cache ABI for machine ${machine}`);
  let best: { file: string; priority: number } | undefined;
  for (const entry of entries) {
    if (entry.name !== name || entry.flags !== flags) continue;
    const priority = entry.hardwareCapability === undefined ? capabilities.length : capabilities.indexOf(entry.hardwareCapability);
    if (priority < 0 || (machine === 62 && entry.isaLevel && (BigInt(isaLevels) & (1n << BigInt(entry.isaLevel))) === 0n)) continue;
    if (!best || priority < best.priority) best = { file: entry.file, priority };
  }
  return best?.file;
}
