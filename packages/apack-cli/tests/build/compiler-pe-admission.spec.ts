import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { assertCapturedPeLibraries } from '../../src/build/compiler-pe-admission.ts';
import type { CompilerPeActivationContext } from '../../src/build/compiler-pe-activation.ts';
import type { CompilerPeEnvironment } from '../../src/build/compiler-pe-environment.ts';
import { peImage } from '../_support/pe-image.ts';

const entry = 'C:\\pack\\binding\\addon.node';
const library = 'C:\\pack\\binding\\value.dll';
const environment: CompilerPeEnvironment = { systemDirectory: 'C:\\Windows\\System32', windowsDirectory: 'C:\\Windows',
  safeSearch: true, devOverride: false, knownDlls: [], apiSets: [], nodeApiExports: [], schema: 'C:\\Windows\\System32\\apisetschema.dll',
  applicationContext: { image: 'C:\\compiler\\node.exe', inputs: [], redirections: [] } };

function image(dependency?: string, forwarder?: string, resource?: number) {
  const image = peImage();
  if (dependency) { image.imports(); image.text(0x1200, dependency); }
  if (forwarder) {
    image.directory(0, 0x1a00, 0x100); image.uint(0x1a10, 7); image.uint(0x1a14, 1); image.uint(0x1a18, 1);
    image.uint(0x1a1c, 0x1b00); image.uint(0x1a20, 0x1b20); image.uint(0x1a24, 0x1b40);
    image.uint(0x1b00, 0x1a70); image.text(0x1a70, forwarder);
    image.uint(0x1b20, 0x1c00); image.text(0x1c00, 'native_value');
  }
  if (resource) {
    image.directory(2, 0x1d00, 0x400);
    for (const [level, name] of [24, resource, 1033].entries()) {
      const at = 0x1d00 + level * 32;
      image.bytes.writeUInt16LE(1, image.offset(at + 14)); image.uint(at + 16, name);
      image.uint(at + 20, level === 2 ? 0x60 : 0x80000000 + (level + 1) * 32);
    }
    image.uint(0x1d60, 0x1f00); image.uint(0x1d64, 11); image.text(0x1f00, '<assembly/>');
  }
  return image.bytes;
}

function admission(files: [string, Buffer][], options: { environment?: Partial<CompilerPeEnvironment>;
  variables?: NodeJS.ProcessEnv; loaded?: string[]; directories?: string[]; executable?: string;
  realpath?: (file: string) => string; contexts?: Record<string, CompilerPeActivationContext> } = {}) {
  const entries: [string, Buffer][] = [[entry, image('value.dll')], ...files];
  const images = new Map(entries.map(([file, bytes]) => [file.toLowerCase(), bytes]));
  const reads: string[] = [];
  return { reads, check: () => assertCapturedPeLibraries(entry, 'C:\\pack', {
    environment: { ...environment, applicationContext: { ...environment.applicationContext,
      image: options.executable ?? environment.applicationContext.image }, ...options.environment },
    executable: options.executable ?? 'C:\\compiler\\node.exe', cwd: 'C:\\work',
    variables: options.variables ?? {}, loadedLibraries: options.loaded ?? [], arch: 'x64',
    moduleContext: file => options.contexts?.[file] ?? { image: file, inputs: [], redirections: [] },
    directoryExists: file => options.directories?.includes(file) ?? false,
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

it('uses application-context redirection before loaded images, KnownDLLs and adjacent libraries', () => {
  const selected = 'C:\\compiler\\private\\value.dll';
  const value = admission([[library, image()], [selected, image()]], {
    loaded: [library], environment: { knownDlls: ['value.dll'],
      applicationContext: { image: 'C:\\compiler\\node.exe', inputs: [], redirections: [{ name: 'VALUE.dll', file: selected }] } },
  });
  expect(value.check).toThrow(selected);
});

it('checks physical ownership of application-context libraries', () => {
  const value = admission([[library, image()]], {
    environment: { applicationContext: { image: 'C:\\compiler\\node.exe', inputs: [], redirections: [{ name: 'value.dll', file: library }] } },
    realpath: file => file === library ? 'C:\\outside\\value.dll' : file,
  });
  expect(value.check).toThrow('outside its captured package');
});

it('uses a DLL context for its imports and dependencies without their own context', () => {
  const selected = 'C:\\pack\\private\\value.dll', deeper = 'C:\\pack\\private\\deeper.dll';
  const value = admission([[entry, image('value.dll', undefined, 2)], [library, Buffer.from('unused')],
    [selected, image('deeper.dll')], [deeper, image()]], {
    loaded: [library], environment: { knownDlls: ['value.dll'], applicationContext: {
      image: 'C:\\compiler\\node.exe', inputs: [], redirections: [{ name: 'value.dll', file: 'C:\\outside\\value.dll' }] } },
    contexts: { [entry]: { image: entry, inputs: [], redirections: [{ name: 'value.dll', file: selected }, { name: 'deeper.dll', file: deeper }] } },
  });
  expect(value.check).not.toThrow();
  expect(value.reads).toContain(deeper);
  expect(value.reads).not.toContain(library);
});

it('replaces the inherited context when a dependency declares its own resource 2', () => {
  const selected = 'C:\\pack\\private\\value.dll', deeper = 'C:\\pack\\private\\deeper.dll';
  const value = admission([[entry, image('value.dll', undefined, 2)], [selected, image('deeper.dll', undefined, 2)], [deeper, image()]], {
    contexts: {
      [entry]: { image: entry, inputs: [], redirections: [{ name: 'value.dll', file: selected }, { name: 'deeper.dll', file: 'C:\\outside\\deeper.dll' }] },
      [selected]: { image: selected, inputs: [], redirections: [{ name: 'deeper.dll', file: deeper }] },
    },
  });
  expect(value.check).not.toThrow();
  expect(value.reads).toContain(deeper);
});

it('refuses an outside library selected by a DLL context', () => {
  const selected = 'C:\\outside\\value.dll';
  const value = admission([[entry, image('value.dll', undefined, 2)], [library, image()], [selected, image()]], {
    contexts: { [entry]: { image: entry, inputs: [], redirections: [{ name: 'value.dll', file: selected }] } },
  });
  expect(value.check).toThrow(selected);
});

it('does not treat a resource-3 manifest as a static-import context', () => {
  const value = admission([[entry, image('value.dll', undefined, 3)], [library, image()]], {
    contexts: { [entry]: { image: entry, inputs: [], redirections: [{ name: 'value.dll', file: null }] } },
  });
  expect(value.check).not.toThrow();
});

it('does not fall back to an adjacent DLL when the activation context names a missing library', () => {
  const value = admission([[library, image()]], {
    environment: { applicationContext: { image: 'C:\\compiler\\node.exe', inputs: [], redirections: [{ name: 'value.dll', file: null }] } },
  });
  expect(value.check).toThrow('activation context cannot locate');
});

it.each(['file', 'directory', 'missing'] as const)('observes and rejects changed %s context inputs', kind => {
  const manifest = 'C:\\compiler\\private\\value.manifest';
  const value = admission([[library, image()], [manifest, Buffer.from('changed')]], {
    environment: { applicationContext: { image: 'C:\\compiler\\node.exe',
      inputs: [{ file: manifest, kind, hash: kind === 'file' ? createHash('sha256').update('original').digest('hex') : null }], redirections: [] } },
  });
  expect(value.check).toThrow(`Windows activation context changed during inspection: ${manifest}`);
  expect(value.reads).toContain(manifest);
});

it('delegates the running Node image to its installation owner without recording private executable bytes', () => {
  const value = admission([[entry, image('node.exe')], ['C:\\compiler\\node.exe', Buffer.from('owned runtime')]]);
  expect(value.check).not.toThrow();
  expect(value.reads).not.toContain('C:\\compiler\\node.exe');
});

function delayedHostImage(dependency = 'node.exe', symbol: string | number = 'napi_create_int32') {
  const value = peImage();
  value.directory(13, 0x1000, 64); value.uint(0x1000, 1);
  value.uint(0x1004, 0x1200); value.uint(0x100c, 0x1300); value.uint(0x1010, 0x1100);
  value.text(0x1200, dependency);
  value.pointer(0x1100, typeof symbol === 'number' ? (1n << 63n) | BigInt(symbol) : 0x1400n);
  if (typeof symbol === 'string') value.text(0x1402, symbol);
  return value.bytes;
}

it('binds verified delayed Node-API imports to a renamed host instead of a Node installation on PATH', () => {
  const value = admission([[entry, delayedHostImage()], ['C:\\outside\\node.exe', image()]], {
    executable: 'C:\\compiler\\apack.exe', environment: { nodeApiExports: ['napi_create_int32'] },
    variables: { PATH: 'C:\\outside' },
  });
  expect(value.check).not.toThrow();
  expect(value.reads).not.toContain('C:\\outside\\node.exe');
  expect(value.reads).not.toContain('C:\\compiler\\apack.exe');
});

it.each(['value.dll', 'node.dll', 'libnode.dll'])('still admits delayed %s as a library', dependency => {
  const file = 'C:\\outside\\' + dependency;
  const value = admission([[entry, delayedHostImage(dependency)], [file, image()]], {
    executable: 'C:\\compiler\\apack.exe', environment: { nodeApiExports: ['napi_create_int32'] },
    variables: { PATH: 'C:\\outside' },
  });
  expect(value.check).toThrow(file);
});

it.each(['native_value', 7])('does not assume delayed host symbol %s is supplied by the runtime', symbol => {
  const value = admission([[entry, delayedHostImage('node.exe', symbol)], ['C:\\outside\\node.exe', image()]], {
    executable: 'C:\\compiler\\apack.exe', environment: { nodeApiExports: ['napi_create_int32'] },
    variables: { PATH: 'C:\\outside' },
  });
  expect(value.check).toThrow('C:\\outside\\node.exe');
});

it('refuses a missing Node-API host export without selecting a different Node installation', () => {
  const value = admission([[entry, delayedHostImage('node.exe', 'napi_missing')], ['C:\\outside\\node.exe', image()]], {
    executable: 'C:\\compiler\\apack.exe', environment: { nodeApiExports: ['napi_create_int32'] },
    variables: { PATH: 'C:\\outside' },
  });
  expect(value.check).toThrow('does not export Node-API symbol "napi_missing"');
  expect(value.reads).not.toContain('C:\\outside\\node.exe');
});

it('checks the loaded shared Node-API host selected by the delay hook', () => {
  const file = 'C:\\outside\\libnode.dll';
  const value = admission([[entry, delayedHostImage()], [file, image()]], {
    executable: 'C:\\compiler\\apack.exe', environment: { nodeApiExports: ['napi_create_int32'] }, loaded: [file],
  });
  expect(value.check).toThrow(file);
});

it('does not reinterpret an eager Node-API import as a delay hook', () => {
  const eager = peImage(); eager.imports(); eager.text(0x1200, 'node.exe');
  eager.text(0x1402, 'napi_create_int32'); eager.pointer(0x1108, 0n);
  const file = 'C:\\outside\\node.exe';
  const value = admission([[entry, eager.bytes], [file, image()]], {
    executable: 'C:\\compiler\\apack.exe', environment: { nodeApiExports: ['napi_create_int32'] },
    variables: { PATH: 'C:\\outside' },
  });
  expect(value.check).toThrow(file);
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

const executable = 'C:\\compiler\\node.exe';

it.each(['file', 'directory'] as const)('refuses an outside DLL selected by a .local %s before loaded and known DLLs', kind => {
  const selected = kind === 'file' ? 'C:\\compiler\\value.dll' : executable + '.local\\value.dll';
  const value = admission([[library, image()], [executable, image()], [selected, image()],
    ...(kind === 'file' ? [[executable + '.local', Buffer.alloc(0)] as [string, Buffer]] : [])], {
    loaded: [library], environment: { knownDlls: ['value.dll'] },
    directories: kind === 'directory' ? [executable + '.local'] : [],
  });
  expect(value.check).toThrow(selected);
});

it('checks redirection of the explicitly requested native image itself', () => {
  const selected = 'C:\\compiler\\addon.node';
  const value = admission([[executable, image()], [executable + '.local', Buffer.alloc(0)], [selected, image()]]);
  expect(value.check).toThrow(selected);
});

it('accepts package-contained redirection and observes missing candidates before normal lookup', () => {
  const contained = 'C:\\pack\\runtime\\node.exe';
  const selected = contained + '.local\\value.dll';
  const value = admission([[library, Buffer.from('unused')], [contained, image()], [selected, image()]], {
    executable: contained, directories: [contained + '.local'],
  });
  expect(value.check).not.toThrow();
  expect(value.reads).toContain(selected);
  const missing = admission([[library, image()], [executable, image()], [executable + '.local', Buffer.alloc(0)]]);
  expect(missing.check).not.toThrow();
  expect(missing.reads).toContain('C:\\compiler\\value.dll');
});

it('does not trust a contained .local directory that links to an outside DLL', () => {
  const contained = 'C:\\pack\\runtime\\node.exe';
  const selected = contained + '.local\\value.dll';
  const value = admission([[contained, image()], [selected, image()]], {
    executable: contained, directories: [contained + '.local'],
    realpath: file => file === selected ? 'C:\\outside\\value.dll' : file,
  });
  expect(value.check).toThrow(selected);
});

it('suppresses .local for an embedded application manifest', () => {
  const executableImage = peImage();
  executableImage.directory(2, 0x1d00, 0x400);
  for (const [level, name] of [24, 1, 1033].entries()) {
    const at = 0x1d00 + level * 32;
    executableImage.bytes.writeUInt16LE(1, executableImage.offset(at + 14));
    executableImage.uint(at + 16, name);
    executableImage.uint(at + 20, level === 2 ? 0x60 : 0x80000000 + (level + 1) * 32);
  }
  executableImage.uint(0x1d60, 0x1f00); executableImage.uint(0x1d64, 11);
  executableImage.text(0x1f00, '<assembly/>');
  const value = admission([[library, image()], [executable, executableImage.bytes],
    [executable + '.local', Buffer.alloc(0)], ['C:\\compiler\\value.dll', image()]]);
  expect(value.check).not.toThrow();
});

it.each([false, true])('respects manifest suppression of .local unless DevOverrideEnable is set (%s)', devOverride => {
  const selected = 'C:\\compiler\\value.dll';
  const value = admission([[library, image()], [executable, image()], [selected, image()],
    [executable + '.local', Buffer.alloc(0)], [executable + '.manifest', Buffer.from('<assembly/>')]], {
    environment: { devOverride },
  });
  if (devOverride) expect(value.check).toThrow(selected);
  else expect(value.check).not.toThrow();
});
