import { expect, it } from 'vitest';
import { assertCapturedPeLibraries } from '../../src/build/compiler-pe-admission.ts';
import type { CompilerPeEnvironment } from '../../src/build/compiler-pe-environment.ts';
import { peImage } from '../_support/pe-image.ts';

const entry = 'C:\\pack\\binding\\addon.node';
const library = 'C:\\pack\\binding\\value.dll';
const environment: CompilerPeEnvironment = { systemDirectory: 'C:\\Windows\\System32', windowsDirectory: 'C:\\Windows',
  safeSearch: true, knownDlls: [], apiSets: [], schema: 'C:\\Windows\\System32\\apisetschema.dll' };

function image(dependency?: string, forwarder?: string) {
  const image = peImage();
  if (dependency) { image.imports(); image.text(0x1200, dependency); }
  if (forwarder) {
    image.directory(0, 0x1a00, 0x100); image.uint(0x1a10, 7); image.uint(0x1a14, 1); image.uint(0x1a18, 1);
    image.uint(0x1a1c, 0x1b00); image.uint(0x1a20, 0x1b20); image.uint(0x1a24, 0x1b40);
    image.uint(0x1b00, 0x1a70); image.text(0x1a70, forwarder);
    image.uint(0x1b20, 0x1c00); image.text(0x1c00, 'native_value');
  }
  return image.bytes;
}

function admission(files: [string, Buffer][], options: { environment?: Partial<CompilerPeEnvironment>;
  variables?: NodeJS.ProcessEnv; loaded?: string[]; realpath?: (file: string) => string } = {}) {
  const entries: [string, Buffer][] = [[entry, image('value.dll')], ...files];
  const images = new Map(entries.map(([file, bytes]) => [file.toLowerCase(), bytes]));
  const reads: string[] = [];
  return { reads, check: () => assertCapturedPeLibraries(entry, 'C:\\pack', {
    environment: { ...environment, ...options.environment }, executable: 'C:\\compiler\\node.exe', cwd: 'C:\\work',
    variables: options.variables ?? {}, loadedLibraries: options.loaded ?? [], arch: 'x64',
    read(file) { reads.push(file); return images.get(file.toLowerCase()); }, realpath: options.realpath ?? (file => file),
  }) };
}

it('observes a package DLL graph and terminates import cycles', () => {
  const value = admission([[library, image('addon.node')]]);
  expect(value.check).not.toThrow();
  expect(value.reads).toContain(library);
  expect(value.reads).toContain(environment.schema);
});

it('keeps the top image directory for transitive altered-search-path lookup', () => {
  const value = admission([[library, image('deeper.dll')], ['C:\\pack\\binding\\deeper.dll', image()]]);
  expect(value.check).not.toThrow();
  expect(value.reads).toContain('C:\\pack\\binding\\deeper.dll');
});

it('refuses a PATH-selected DLL outside its package', () => {
  const value = admission([['C:\\outside\\value.dll', image()]], { variables: { Path: '"C:\\outside"' } });
  expect(value.check).toThrow('C:\\outside\\value.dll');
});

it('refuses package-absolute imports that would keep loading source bytes after capture', () => {
  const value = admission([[entry, image(library)], [library, image()]]);
  expect(value.check).toThrow('outside its captured package');
});

it('checks physical ownership instead of trusting a package-contained link', () => {
  const value = admission([[library, image()]], { realpath: file => file === library ? 'C:\\outside\\value.dll' : file });
  expect(value.check).toThrow('outside its captured package');
});

it('refuses an already-loaded outside DLL even when an adjacent copy exists', () => {
  const value = admission([[library, image()], ['C:\\outside\\VALUE.DLL', image()]], { loaded: ['C:\\outside\\VALUE.DLL'] });
  expect(value.check).toThrow('C:\\outside\\VALUE.DLL');
});

it('uses KnownDLLs before adjacent images and accepts physical OS libraries', () => {
  const value = admission([[library, Buffer.from('invalid')], ['C:\\Windows\\System32\\value.dll', Buffer.from('OS')]],
    { environment: { knownDlls: ['value.dll'] } });
  expect(value.check).not.toThrow();
  expect(value.reads).not.toContain(library);
});

it('delegates the running Node image to its installation owner without recording private executable bytes', () => {
  const value = admission([[entry, image('node.exe')], ['C:\\compiler\\node.exe', Buffer.from('owned runtime')]]);
  expect(value.check).not.toThrow();
  expect(value.reads).not.toContain('C:\\compiler\\node.exe');
});

it('does not trust a System32 link to an outside DLL', () => {
  const value = admission([['C:\\Windows\\System32\\value.dll', image()]], { environment: { knownDlls: ['value.dll'] },
    realpath: file => file.endsWith('value.dll') ? 'C:\\outside\\value.dll' : file });
  expect(value.check).toThrow('outside its captured package');
});

it('recognizes OS paths across DOS and extended namespace spellings', () => {
  const value = admission([['C:\\Windows\\System32\\value.dll', Buffer.from('OS')]], {
    environment: { systemDirectory: '\\\\?\\C:\\Windows\\System32', windowsDirectory: '\\\\?\\C:\\Windows' },
    loaded: ['C:\\Windows\\System32\\value.dll'], realpath: file => '\\\\?\\' + file,
  });
  expect(value.check).not.toThrow();
});

it('resolves API sets from the OS mapping instead of accepting a name prefix', () => {
  const value = admission([[entry, image('api-ms-test-l1-1-0.dll')], ['C:\\Windows\\System32\\host.dll', Buffer.from('OS')]],
    { environment: { apiSets: [{ name: 'api-ms-test-l1-1-0', hashedName: 'api-ms-test-l1-1', hosts: [{ importer: '', library: 'host.dll' }] }] } });
  expect(value.check).not.toThrow();
  expect(value.reads).toContain('C:\\Windows\\System32\\host.dll');
});

it.each([true, false])('preserves safe-search precedence (enabled %s)', safeSearch => {
  const value = admission([['C:\\work\\value.dll', image()], ['C:\\Windows\\System32\\value.dll', Buffer.from('OS')]],
    { environment: { safeSearch } });
  if (safeSearch) expect(value.check).not.toThrow();
  else expect(value.check).toThrow('C:\\work\\value.dll');
});

it('follows selected named and ordinal export forwarders before initialization', () => {
  const value = admission([[library, image(undefined, 'forward.#9')], ['C:\\outside\\forward.dll', image()]],
    { variables: { PATH: 'C:\\outside' } });
  expect(value.check).toThrow('C:\\outside\\forward.dll');
});

it('attributes malformed package DLL metadata', () => {
  expect(admission([[library, Buffer.from('invalid')]]).check).toThrow(`Cannot inspect native compiler image "${library}"`);
});
