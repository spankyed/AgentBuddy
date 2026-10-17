import { posix as path } from 'node:path';
import { expect, it } from 'vitest';
import { assertCapturedMachOLibraries, parseMachOLibraryCommands } from '../../src/build/compiler-native-libraries.ts';

function image(commands: [number, string][], little = true) {
  const write = (buffer: Buffer, value: number, at: number) => little ? buffer.writeUInt32LE(value, at) : buffer.writeUInt32BE(value, at);
  const entries = commands.map(([command, name]) => {
    const value = Buffer.from(name + '\0');
    const entry = Buffer.alloc(Math.ceil((24 + value.length) / 8) * 8);
    write(entry, command, 0); write(entry, entry.length, 4); write(entry, 24, 8);
    value.copy(entry, 24);
    return entry;
  });
  const header = Buffer.alloc(32);
  write(header, 0xfeedfacf, 0); write(header, entries.length, 16);
  write(header, entries.reduce((sum, entry) => sum + entry.length, 0), 20);
  return Buffer.concat([header, ...entries]);
}

it.each([true, false])('distinguishes dependencies and rpaths from image IDs (little endian: %s)', little => {
  expect(parseMachOLibraryCommands(image([
    [0xd, '/build-machine/not-a-dependency'], [0xc, '/usr/lib/libSystem.B.dylib'],
    [0x80000018, '@loader_path/weak.dylib'], [0x8000001f, '@rpath/reexport.dylib'],
    [0x8000001c, '@loader_path/lib'],
  ], little), 'arm64')).toEqual({ dependencies: ['/usr/lib/libSystem.B.dylib', '@loader_path/weak.dylib', '@rpath/reexport.dylib'], rpaths: ['@loader_path/lib'] });
});

it('inspects only the selected architecture in a universal image', () => {
  const x64 = image([[0xc, '/outside/wrong-architecture.dylib']]);
  const arm64 = image([[0xc, '/usr/lib/libSystem.B.dylib']]);
  const header = Buffer.alloc(48);
  header.writeUInt32BE(0xcafebabe, 0); header.writeUInt32BE(2, 4);
  header.writeUInt32BE(0x1000007, 8); header.writeUInt32BE(48, 16); header.writeUInt32BE(x64.length, 20);
  header.writeUInt32BE(0x100000c, 28); header.writeUInt32BE(48 + x64.length, 36); header.writeUInt32BE(arm64.length, 40);
  expect(parseMachOLibraryCommands(Buffer.concat([header, x64, arm64]), 'arm64').dependencies).toEqual(['/usr/lib/libSystem.B.dylib']);
});

it('refuses truncated and invalid command ranges', () => {
  const bytes = image([[0xc, '/outside/lib.dylib']]);
  expect(() => parseMachOLibraryCommands(bytes.subarray(0, -1), 'arm64')).toThrow('Invalid Mach-O');
  bytes.writeUInt32LE(0, 36);
  expect(() => parseMachOLibraryCommands(bytes, 'arm64')).toThrow('Invalid Mach-O');
});

const root = path.resolve('/captured/package');
const entry = path.join(root, 'binding/addon.node');
function check(files: Map<string, Buffer>, realpath = (file: string) => file) {
  return () => assertCapturedMachOLibraries(entry, root, { arch: 'arm64', read: file => files.get(file), realpath });
}

it('accepts transitive package-relative and system libraries without treating IDs as dependencies', () => {
  const library = path.join(root, 'lib/value.dylib');
  const nested = path.join(root, 'lib/nested.dylib');
  expect(check(new Map([
    [entry, image([[0xd, '/outside/build-id'], [0xc, '@loader_path/../lib/value.dylib']])],
    [library, image([[0xc, '@loader_path/nested.dylib']])],
    [nested, image([[0xc, '/System/Library/Frameworks/Foundation.framework/Foundation']])],
  ]))).not.toThrow();
});

it.each([
  '/outside/lib.dylib', path.join(root, 'lib/live-original.dylib'), '@loader_path/../../../outside/lib.dylib', '../outside/lib.dylib',
])('refuses a dependency that bypasses the captured package: %s', dependency => {
  expect(check(new Map([[entry, image([[0xc, dependency]])]]))).toThrow('outside its captured package');
});

it('checks package rpaths and refuses external search roots', () => {
  const library = path.join(root, 'lib/value.dylib');
  expect(check(new Map([[entry, image([[0x8000001c, '@loader_path/../lib'], [0xc, '@rpath/value.dylib']])], [library, image([])]]))).not.toThrow();
  expect(check(new Map([[entry, image([[0x8000001c, '/outside'], [0xc, '@rpath/value.dylib']])]]))).toThrow('references "/outside"');
});

it('refuses transitive escapes and symlinks outside the package', () => {
  const library = path.join(root, 'lib/value.dylib');
  const files = new Map([[entry, image([[0xc, '@loader_path/../lib/value.dylib']])], [library, image([[0xc, '/outside/nested.dylib']])]]);
  expect(check(files)).toThrow('references "/outside/nested.dylib"');
  files.set(library, image([]));
  expect(check(files, file => file === library ? '/outside/value.dylib' : file)).toThrow('outside its captured package');
});

it('does not confuse unused search paths with outside-library dependencies', () => {
  expect(check(new Map([[entry, image([[0x8000001c, '/build-machine/unused'], [0xc, '/usr/lib/libSystem.B.dylib']])]]))).not.toThrow();
});

it('preserves search order when a captured library precedes an unused outside fallback', () => {
  const library = path.join(root, 'lib/value.dylib');
  expect(check(new Map([
    [entry, image([[0x8000001c, '@loader_path/../lib'], [0x8000001c, '/unused/outside'], [0xc, '@rpath/value.dylib']])],
    [library, image([])],
  ]))).not.toThrow();
});
