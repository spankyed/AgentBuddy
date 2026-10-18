import { expect, it } from 'vitest';
import { findElfCachedLibrary, parseElfLibraryCache } from '../../src/build/compiler-elf-cache.ts';

function cache(entries: { name: string; file: string; flags?: number; capability?: number; isa?: number }[],
  options: { little?: boolean; combined?: boolean; capabilities?: string[] } = {}) {
  const bytes = Buffer.alloc(4096), base = options.combined ? 32 : 0, little = options.little !== false;
  const uint = (offset: number, value: number) => little ? bytes.writeUInt32LE(value, offset) : bytes.writeUInt32BE(value, offset);
  if (base) { bytes.write('ld.so-1.7.0'); uint(12, 1); }
  bytes.write('glibc-ld.so.cache1.1', base);
  uint(base + 20, entries.length); bytes[base + 28] = little ? 2 : 3;
  const strings = base + 48 + entries.length * 24;
  let cursor = strings;
  const string = (value: string) => { const start = cursor; cursor += bytes.write(value + '\0', cursor); return start; };
  entries.forEach((entry, i) => {
    const at = base + 48 + i * 24;
    uint(at, entry.flags ?? 0x303); uint(at + 4, string(entry.name) - base); uint(at + 8, string(entry.file) - base);
    const hwcap = entry.capability === undefined ? 0n : (1n << 62n) | BigInt(entry.isa ?? 0) << 32n | BigInt(entry.capability);
    if (little) bytes.writeBigUInt64LE(hwcap, at + 16); else bytes.writeBigUInt64BE(hwcap, at + 16);
  });
  const capabilities = (options.capabilities ?? []).map(string);
  uint(base + 24, cursor - strings);
  if (capabilities.length) {
    cursor = Math.ceil(cursor / 4) * 4;
    uint(base + 32, cursor); uint(cursor, 0x100000000 - 358342284); uint(cursor + 4, 1);
    uint(cursor + 8, 1); uint(cursor + 16, cursor + 24); uint(cursor + 20, capabilities.length * 4);
    capabilities.forEach((offset, i) => uint(cursor + 24 + i * 4, offset));
    cursor += 24 + capabilities.length * 4;
  }
  return { bytes: bytes.subarray(0, cursor), uint };
}

it.each([true, false])('reads cache entries and ABI flags (little endian %s)', little => {
  const { bytes } = cache([{ name: 'value.so', file: '/usr/lib/value.so' },
    { name: 'value.so', file: '/usr/lib/arm/value.so', flags: 0xa03 }], { little });
  const entries = parseElfLibraryCache(bytes, little);
  expect(findElfCachedLibrary(entries, 'value.so', 62, [], 0)).toBe('/usr/lib/value.so');
  expect(findElfCachedLibrary(entries, 'value.so', 183, [], 0)).toBe('/usr/lib/arm/value.so');
});

it('prefers the newer table in a combined OS cache', () => {
  const { bytes } = cache([{ name: 'value.so', file: '/outside/value.so' }], { combined: true });
  expect(parseElfLibraryCache(bytes, true)).toMatchObject([{ name: 'value.so', file: '/outside/value.so', flags: 0x303 }]);
});

it('reads an original-format OS cache', () => {
  const bytes = Buffer.alloc(128);
  bytes.write('ld.so-1.7.0'); bytes.writeUInt32LE(1, 12); bytes.writeUInt32LE(0x303, 16);
  bytes.writeUInt32LE(0, 20); bytes.writeUInt32LE(9, 24); bytes.write('value.so\0/usr/lib/value.so\0', 28);
  expect(parseElfLibraryCache(bytes, true)).toMatchObject([{ name: 'value.so', file: '/usr/lib/value.so' }]);
});

it('selects active hardware-capability entries by loader priority and ISA requirements', () => {
  const { bytes } = cache([
    { name: 'value.so', file: '/lib/v4/value.so', capability: 1, isa: 3 },
    { name: 'value.so', file: '/lib/v3/value.so', capability: 0, isa: 2 },
    { name: 'value.so', file: '/lib/value.so' },
  ], { capabilities: ['x86-64-v3', 'x86-64-v4'] });
  const entries = parseElfLibraryCache(bytes, true);
  expect(findElfCachedLibrary(entries, 'value.so', 62, ['x86-64-v4', 'x86-64-v3'], 7)).toBe('/lib/v3/value.so');
  expect(findElfCachedLibrary(entries, 'value.so', 62, ['x86-64-v4', 'x86-64-v3'], 15)).toBe('/lib/v4/value.so');
  expect(findElfCachedLibrary(entries, 'value.so', 62, [], 15)).toBe('/lib/value.so');
});

it.each([
  ['magic', (bytes: Buffer) => { bytes[0] = 0; }],
  ['count', (bytes: Buffer) => { bytes.writeUInt32LE(0xffffffff, 20); }],
  ['strings', (bytes: Buffer) => { bytes.writeUInt32LE(0xffffffff, 24); }],
  ['endian', (bytes: Buffer) => { bytes[28] = 3; }],
  ['key', (bytes: Buffer) => { bytes.writeUInt32LE(0, 52); }],
  ['value', (bytes: Buffer) => { bytes.writeUInt32LE(0xffffffff, 56); }],
  ['extension', (bytes: Buffer) => { bytes.writeUInt32LE(0xffffffff, 32); }],
] as const)('refuses malformed cache %s', (_name, mutate) => {
  const { bytes } = cache([{ name: 'value.so', file: '/usr/lib/value.so' }]);
  mutate(bytes);
  expect(() => parseElfLibraryCache(bytes, true)).toThrow('Invalid ELF operating-system library cache');
});
