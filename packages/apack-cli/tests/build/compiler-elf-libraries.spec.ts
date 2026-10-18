import { expect, it } from 'vitest';
import { parseElfLibraryCommands } from '../../src/build/compiler-elf-libraries.ts';

/** Program headers only: real shared objects need no section table for loader discovery. */
function image(wide = true, little = true, entries: [number, string | number][] = []) {
  const bytes = Buffer.alloc(0x500);
  const uint16 = (at: number, value: number) => little ? bytes.writeUInt16LE(value, at) : bytes.writeUInt16BE(value, at);
  const uint32 = (at: number, value: number) => little ? bytes.writeUInt32LE(value, at) : bytes.writeUInt32BE(value, at);
  const word = (at: number, value: number) => wide
    ? little ? bytes.writeBigUInt64LE(BigInt(value), at) : bytes.writeBigUInt64BE(BigInt(value), at)
    : uint32(at, value);
  const header = wide ? 64 : 52, program = wide ? 56 : 32, entry = wide ? 16 : 8;
  bytes.set([0x7f, 0x45, 0x4c, 0x46, wide ? 2 : 1, little ? 1 : 2, 1]);
  uint16(16, 3); uint16(18, wide ? 62 : 3); uint32(20, 1);
  word(wide ? 32 : 28, header);
  uint16(wide ? 52 : 40, header); uint16(wide ? 54 : 42, program); uint16(wide ? 56 : 44, 2);
  uint32(header, 1);
  word(header + (wide ? 16 : 8), 0x400000);
  word(header + (wide ? 32 : 16), bytes.length); word(header + (wide ? 40 : 20), bytes.length);
  const dynamic = header + program;
  uint32(dynamic, 2); word(dynamic + (wide ? 8 : 4), 0x100);
  word(dynamic + (wide ? 32 : 16), (entries.length + 3) * entry);
  word(dynamic + (wide ? 40 : 20), (entries.length + 3) * entry);
  let stringSize = 1;
  const encoded = entries.map(([tag, value]): [number, number] => {
    if (typeof value === 'number') return [tag, value];
    const offset = stringSize;
    stringSize += bytes.write(value + '\0', 0x300 + stringSize);
    return [tag, offset];
  });
  [[5, 0x400300], [10, stringSize], ...encoded, [0, 0]].forEach(([tag, value], i) => {
    word(0x100 + i * entry, tag); word(0x100 + i * entry + entry / 2, value);
  });
  return { bytes, word, uint16, uint32, header, dynamic, entry };
}

it.each([[true, true], [true, false], [false, true], [false, false]])(
  'reads ordered dependencies and distinct search paths (64-bit %s, little endian %s)', (wide, little) => {
    const { bytes } = image(wide, little, [[1, '$ORIGIN/../lib/libvalue.so'], [1, 'libc.so.6'],
      [15, '$ORIGIN/old'], [29, '$ORIGIN/new:'], [0x6ffffffb, 0x800]]);
    expect(parseElfLibraryCommands(bytes)).toEqual({ machine: wide ? 62 : 3,
      dependencies: ['$ORIGIN/../lib/libvalue.so', 'libc.so.6'],
      rpath: '$ORIGIN/old', runpath: '$ORIGIN/new:', flags1: 0x800,
      auxiliary: [], filters: [], audit: undefined, dependencyAudit: undefined });
  },
);

it('exposes additional image-loading declarations instead of silently ignoring them', () => {
  const { bytes } = image(true, true, [[0x7ffffffd, 'aux.so'], [0x7fffffff, 'filter.so'],
    [0x6ffffefc, 'audit.so'], [0x6ffffefb, 'dependency-audit.so']]);
  expect(parseElfLibraryCommands(bytes)).toMatchObject({ auxiliary: ['aux.so'], filters: ['filter.so'],
    audit: 'audit.so', dependencyAudit: 'dependency-audit.so' });
});

it('ignores unrelated dynamic pointer values without interpreting them as file offsets', () => {
  const { bytes } = image(true, true, [[12, 0]]);
  bytes.writeBigUInt64LE(0xffffffffffffffffn, 0x128);
  expect(parseElfLibraryCommands(bytes).dependencies).toEqual([]);
});

it.each([true, false])('reads extended program-header counts (64-bit %s)', wide => {
  const { bytes, word, uint16, uint32 } = image(wide);
  word(wide ? 40 : 32, 0x400);
  uint16(wide ? 58 : 46, wide ? 64 : 40);
  uint16(wide ? 56 : 44, 0xffff);
  uint32(0x400 + (wide ? 44 : 28), 2);
  expect(parseElfLibraryCommands(bytes).dependencies).toEqual([]);
});

it('ignores unknown signed tags instead of treating their values as loading declarations', () => {
  const { bytes } = image(true, true, [[12, 0]]);
  bytes.writeBigInt64LE(-1n, 0x120);
  bytes.writeBigUInt64LE(0xffffffffffffffffn, 0x128);
  expect(parseElfLibraryCommands(bytes).dependencies).toEqual([]);
});

it.each([
  ['magic', (value: ReturnType<typeof image>) => { value.bytes[0] = 0; }],
  ['encoding', (value: ReturnType<typeof image>) => { value.bytes[5] = 3; }],
  ['program range', ({ word }: ReturnType<typeof image>) => { word(32, 0x4ff); }],
  ['extended program count', ({ uint16 }: ReturnType<typeof image>) => { uint16(56, 0xffff); }],
  ['file-backed range', ({ word, header }: ReturnType<typeof image>) => { word(header + 32, 0x501); }],
  ['missing dynamic segment', ({ uint32, dynamic }: ReturnType<typeof image>) => { uint32(dynamic, 0); }],
  ['duplicate dynamic segment', ({ uint32, header }: ReturnType<typeof image>) => { uint32(header, 2); }],
  ['missing terminator', ({ word }: ReturnType<typeof image>) => { word(0x130, 1); }],
  ['string-table address', ({ word }: ReturnType<typeof image>) => { word(0x108, 0x500000); }],
  ['string-table extent', ({ word }: ReturnType<typeof image>) => { word(0x118, 0x500); }],
  ['string offset', ({ word }: ReturnType<typeof image>) => { word(0x128, 0x500); }],
  ['unterminated string', ({ bytes }: ReturnType<typeof image>) => { bytes[0x306] = 1; }],
] as const)('refuses malformed %s', (_name, mutate) => {
  const value = image(true, true, [[1, 'value']]);
  mutate(value);
  expect(() => parseElfLibraryCommands(value.bytes)).toThrow(/ELF native library/);
});

it('refuses duplicate singleton tags without merging loader policies', () => {
  const { bytes } = image(true, true, [[29, 'one'], [29, 'two']]);
  expect(() => parseElfLibraryCommands(bytes)).toThrow('Invalid ELF native library commands');
});

it('refuses every truncated header without leaking Buffer range errors', () => {
  const { bytes } = image();
  for (let length = 0; length < 64; length++) {
    expect(() => parseElfLibraryCommands(bytes.subarray(0, length))).toThrow('Invalid ELF native library commands');
  }
});
