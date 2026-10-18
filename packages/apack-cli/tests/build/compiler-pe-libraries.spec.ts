import { expect, it } from 'vitest';
import { parsePeLibraryMetadata, readPeSection } from '../../src/build/compiler-pe-libraries.ts';

import { peImage as image } from '../_support/pe-image.ts';

it.each([true, false])('reads named and ordinal imports (PE32+ %s)', wide => {
  const value = image(wide); value.imports();
  expect(parsePeLibraryMetadata(value.bytes)).toEqual({ machine: wide ? 0x8664 : 0x14c, imageBase: value.imageBase,
    timeStamp: 1234, imports: [{ name: 'value.dll', delayed: false, timeStamp: 0, symbols: [{ name: 'native_value' }, { ordinal: 7 }] }],
    exports: [], manifests: [] });
});

it.each([true, false])('reads delay imports using RVA or VA attributes (RVA %s)', relative => {
  const value = image(false), address = (rva: number) => relative ? rva : Number(value.imageBase) + rva;
  value.directory(13, 0x1500, 64); value.uint(0x1500, relative ? 1 : 0);
  value.uint(0x1504, address(0x1600)); value.uint(0x150c, address(0x1800)); value.uint(0x1510, address(0x1700));
  value.text(0x1600, 'delay.dll'); value.pointer(0x1700, BigInt(address(0x1900))); value.text(0x1902, 'delayed_value');
  expect(parsePeLibraryMetadata(value.bytes).imports).toEqual([
    { name: 'delay.dll', delayed: true, timeStamp: 0, symbols: [{ name: 'delayed_value' }] },
  ]);
});

it('retains bound addresses and timestamps without mistaking them for import names', () => {
  const value = image(); value.imports();
  value.uint(0x1000, 0); value.uint(0x1004, 5678);
  value.pointer(0x1300, 0x180001234n);
  expect(parsePeLibraryMetadata(value.bytes).imports[0]).toMatchObject({ timeStamp: 5678,
    symbols: [{ boundAddress: 0x180001234n }] });
});

it('keeps export aliases, ordinals, virtual data addresses and forwarders distinct', () => {
  const value = image();
  value.directory(0, 0x1a00, 0x100); value.uint(0x1a10, 5); value.uint(0x1a14, 2); value.uint(0x1a18, 3);
  value.uint(0x1a1c, 0x1b00); value.uint(0x1a20, 0x1b20); value.uint(0x1a24, 0x1b40);
  value.uint(0x1b00, 0x2900); value.uint(0x1b04, 0x1a70); value.text(0x1a70, 'target.dll.#9');
  for (const [index, name] of ['value', 'alias', 'redirect'].entries()) {
    value.uint(0x1b20 + index * 4, 0x1c00 + index * 32); value.text(0x1c00 + index * 32, name);
    value.bytes.writeUInt16LE(index === 2 ? 1 : 0, value.offset(0x1b40) + index * 2);
  }
  expect(parsePeLibraryMetadata(value.bytes).exports).toEqual([
    { ordinal: 5, names: ['value', 'alias'], address: 0x2900, forwarder: undefined },
    { ordinal: 6, names: ['redirect'], address: 0x1a70, forwarder: 'target.dll.#9' },
  ]);
});

function manifest() {
  const value = image();
  value.directory(2, 0x1d00, 0x400);
  for (const [level, name] of [24, 2, 1033].entries()) {
    const at = 0x1d00 + level * 32;
    value.bytes.writeUInt16LE(1, value.offset(at + 14)); value.uint(at + 16, name);
    value.uint(at + 20, level === 2 ? 0x60 : (0x80000000 + (level + 1) * 32));
  }
  const payload = Buffer.from('\ufeff<assembly/>', 'utf16le');
  value.uint(0x1d60, 0x1f00); value.uint(0x1d64, payload.length); payload.copy(value.bytes, value.offset(0x1f00));
  return { ...value, payload };
}

it('preserves manifest identity, language and raw XML encoding without activation', () => {
  const value = manifest();
  expect(parsePeLibraryMetadata(value.bytes).manifests).toEqual([{ path: [24, 2, 1033], bytes: value.payload }]);
});

it('reads an OS metadata section through the same checked header interpretation', () => {
  const value = image(); value.bytes.write('.apiset\0', value.section);
  expect(readPeSection(value.bytes, '.apiset')).toEqual(value.bytes.subarray(0x400));
  expect(readPeSection(value.bytes, '.missing')).toBeUndefined();
});

it('does not interpret certificate file offsets as dependency RVAs', () => {
  const value = image(); value.imports(); value.directory(4, 0x4000, 0x100);
  const bytes = Buffer.concat([value.bytes, Buffer.alloc(0x4000)]);
  expect(parsePeLibraryMetadata(bytes).imports[0]?.name).toBe('value.dll');
});

it.each([
  ['DOS header', (value: ReturnType<typeof image>) => { value.bytes[0] = 0; }],
  ['PE header', (value: ReturnType<typeof image>) => { value.bytes.writeUInt32LE(value.bytes.length, 60); }],
  ['optional header', (value: ReturnType<typeof image>) => { value.bytes.writeUInt16LE(1, 0x94); }],
  ['directory count', (value: ReturnType<typeof image>) => { value.bytes.writeUInt32LE(17, value.optional + 108); }],
  ['section range', (value: ReturnType<typeof image>) => { value.bytes.writeUInt32LE(0xffffffff, value.section + 20); }],
  ['import terminator', (value: ReturnType<typeof image>) => { value.directory(1, 0x1000, 20); }],
  ['unbacked name', (value: ReturnType<typeof image>) => { value.uint(0x100c, 0x2900); }],
  ['unterminated name', (value: ReturnType<typeof image>) => { value.bytes.fill(65, value.offset(0x1200)); }],
] as const)('refuses malformed %s with an attributed format error', (_name, mutate) => {
  const value = image(); value.imports(); mutate(value);
  expect(() => parsePeLibraryMetadata(value.bytes)).toThrow('Invalid PE native library metadata');
});

it('refuses a cyclic manifest resource tree', () => {
  const value = manifest(); value.uint(0x1d14, 0x80000000);
  expect(() => parsePeLibraryMetadata(value.bytes)).toThrow('Invalid PE native library metadata');
});

it('refuses manifest bytes in virtual-only memory', () => {
  const value = manifest(); value.uint(0x1d60, 0x2900);
  expect(() => parsePeLibraryMetadata(value.bytes)).toThrow('Invalid PE native library metadata');
});
