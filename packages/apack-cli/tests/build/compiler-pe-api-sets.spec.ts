import { expect, it } from 'vitest';
import { parsePeApiSets, resolvePeApiSet } from '../../src/build/compiler-pe-api-sets.ts';
import { peLibraryPaths } from '../../src/build/compiler-pe-environment.ts';

function namespace() {
  const bytes = Buffer.alloc(1024), name = 'api-ms-test-l1-1-0';
  bytes.writeUInt32LE(6); bytes.writeUInt32LE(bytes.length, 4); bytes.writeUInt32LE(1, 12); bytes.writeUInt32LE(28, 16);
  bytes.writeUInt32LE(128, 32); bytes.writeUInt32LE(name.length * 2, 36); bytes.writeUInt32LE((name.lastIndexOf('-')) * 2, 40);
  bytes.writeUInt32LE(64, 44); bytes.writeUInt32LE(2, 48); bytes.write(name, 128, 'utf16le');
  const text = (at: number, offset: number, value: string) => {
    bytes.writeUInt32LE(offset, at); bytes.writeUInt32LE(value.length * 2, at + 4); bytes.write(value, offset, 'utf16le');
  };
  text(76, 256, 'default.dll'); text(88, 320, 'addon.node'); text(96, 384, 'override.dll');
  return bytes;
}

it('preserves default and importer-specific hosts and resolves the hashed contract', () => {
  const sets = parsePeApiSets(namespace());
  expect(resolvePeApiSet(sets, 'API-MS-TEST-L1-1-8.DLL', 'ADDON.NODE')).toBe('override.dll');
  expect(resolvePeApiSet(sets, 'api-ms-test-l1-1-0.dll', 'another.node')).toBe('default.dll');
  expect(resolvePeApiSet(sets, 'api-ms-missing-l1-1-0.dll', 'addon.node')).toBeUndefined();
});

it.each([
  ['version', (bytes: Buffer) => bytes.writeUInt32LE(7)],
  ['size', (bytes: Buffer) => bytes.writeUInt32LE(bytes.length + 1, 4)],
  ['entries', (bytes: Buffer) => bytes.writeUInt32LE(1020, 16)],
  ['UTF-16 length', (bytes: Buffer) => bytes.writeUInt32LE(3, 36)],
  ['hash length', (bytes: Buffer) => bytes.writeUInt32LE(1024, 40)],
  ['hosts', (bytes: Buffer) => bytes.writeUInt32LE(1020, 44)],
])('refuses malformed API-set %s', (_name, mutate) => {
  const bytes = namespace(); mutate(bytes);
  expect(() => parsePeApiSets(bytes)).toThrow(/Windows API-set namespace/);
});

it('uses Windows environment-key selection and quoted PATH entries', () => {
  expect(peLibraryPaths({ Path: 'ignored', PATH: '"C:\\one";C:\\two;;' })).toEqual(['C:\\one', 'C:\\two']);
});
