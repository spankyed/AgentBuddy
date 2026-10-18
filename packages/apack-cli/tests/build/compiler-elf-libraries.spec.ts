import { expect, it } from 'vitest';
import { assertCapturedElfLibraries, parseElfInterpreter, parseElfLibraryCommands, type ElfLibraryEnvironment } from '../../src/build/compiler-elf-libraries.ts';

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
      soname: undefined, rpath: '$ORIGIN/old', runpath: '$ORIGIN/new:', flags1: 0x800,
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

it.each([true, false])('reads the runtime interpreter without requiring a section table (64-bit %s)', wide => {
  const { bytes, uint32, word, dynamic } = image(wide);
  const interpreter = '/lib64/ld-linux-x86-64.so.2';
  uint32(dynamic, 3);
  word(dynamic + (wide ? 32 : 16), Buffer.byteLength(interpreter) + 1);
  word(dynamic + (wide ? 40 : 20), Buffer.byteLength(interpreter) + 1);
  bytes.write(interpreter + '\0', 0x100);
  expect(parseElfInterpreter(bytes)).toBe(interpreter);
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

const entry = '/pack/binding/addon.node';
const environment: ElfLibraryEnvironment = {
  cwd: '/work', executable: '/compiler/bin/node', libraryPaths: [], libraryToken: 'lib/x86_64-linux-gnu',
  platformToken: 'haswell', hardwareCapabilities: [], systemDirectories: ['/lib/x86_64-linux-gnu'], executableRpath: [],
};

function admission(entries: [number, string | number][], files: [string, [number, string | number][]][] = [],
  options: { environment?: Partial<ElfLibraryEnvironment>; cached?: string; loaded?: string; physical?: (file: string) => string } = {}) {
  const images = new Map([[entry, image(true, true, entries).bytes],
    ...files.map(([file, entries]): [string, Buffer] => [file, image(true, true, entries).bytes])]);
  const reads: string[] = [], cache: string[] = [];
  const check = () => assertCapturedElfLibraries(entry, '/pack', {
    environment: { ...environment, ...options.environment },
    read(file) { reads.push(file); return images.get(file); },
    realpath: options.physical ?? (file => file),
    cachedLibrary(name) { cache.push(name); return options.cached; },
    loadedLibrary: () => options.loaded,
  });
  return { check, reads, cache };
}

it('reads a transitive ORIGIN graph and terminates cycles without initializing images', () => {
  const { check, reads } = admission([[1, '$ORIGIN/../lib/first.so']], [
    ['/pack/lib/first.so', [[1, '${ORIGIN}/second.so']]],
    ['/pack/lib/second.so', [[1, '$ORIGIN/first.so']]],
  ]);
  expect(check).not.toThrow();
  expect(reads).toContain('/pack/lib/second.so');
  expect(reads.length).toBeLessThan(10);
});

it.each(['/outside/value.so', '/pack/lib/value.so', '../pack/lib/value.so'])(
  'refuses nonrelocatable dependency %s', reference => {
    const { check } = admission([[1, reference]], [['/pack/lib/value.so', []]]);
    expect(check).toThrow(`image "${entry}" references "${reference}" outside its captured package`);
  },
);

it('attributes transitive escapes to the image that declares them', () => {
  const { check } = admission([[1, '$ORIGIN/../lib/value.so']], [
    ['/pack/lib/value.so', [[1, '/outside/second.so']]],
  ]);
  expect(check).toThrow('image "/pack/lib/value.so" references "/outside/second.so"');
});

it('refuses package-relative links whose physical target escapes the owner', () => {
  const { check } = admission([[1, '$ORIGIN/../lib/value.so']], [['/pack/lib/value.so', []]], {
    physical: file => file === '/pack/lib/value.so' ? '/outside/value.so' : file,
  });
  expect(check).toThrow('outside its captured package');
});

it('inherits RPATH for transitive lookup before LD_LIBRARY_PATH', () => {
  const { check, reads, cache } = admission([[15, '$ORIGIN/../lib'], [1, 'first.so']], [
    ['/pack/lib/first.so', [[1, 'second.so']]], ['/pack/lib/second.so', []], ['/outside/first.so', []],
  ], { environment: { libraryPaths: ['/outside'] } });
  expect(check).not.toThrow();
  expect(reads).not.toContain('/outside/first.so');
  expect(cache).toEqual([]);
});

it('does not inherit RUNPATH for grandchildren', () => {
  const { check } = admission([[29, '$ORIGIN/../lib'], [1, 'first.so']], [
    ['/pack/lib/first.so', [[1, 'second.so']]], ['/pack/lib/second.so', []], ['/outside/second.so', []],
  ], { environment: { libraryPaths: ['/outside'] } });
  expect(check).toThrow('image "/pack/lib/first.so" references "second.so" selects "/outside/second.so"');
});

it('checks environment overrides before RUNPATH and observes earlier missing lookups', () => {
  const { check, reads } = admission([[29, '$ORIGIN/../lib'], [1, 'value.so']], [
    ['/pack/lib/value.so', []], ['/outside/value.so', []],
  ], { environment: { libraryPaths: ['/missing', '/outside'] } });
  expect(check).toThrow('selects "/outside/value.so"');
  expect(reads).toContain('/missing/value.so');
  expect(reads).not.toContain('/pack/lib/value.so');
});

it('suppresses an image RPATH when RUNPATH is declared, including an empty RUNPATH', () => {
  const { check, reads } = admission([[15, '$ORIGIN/../lib'], [29, ''], [1, 'value.so']], [
    ['/pack/lib/value.so', []], ['/work/value.so', []],
  ]);
  expect(check).toThrow('selects "/work/value.so"');
  expect(reads).not.toContain('/pack/lib/value.so');
});

it('expands LIB and PLATFORM using loader metadata and prioritizes active hardware directories', () => {
  const { check, reads } = admission([[29, '${ORIGIN}/../$LIB/${PLATFORM}'], [1, 'value.so']], [
    ['/pack/lib/x86_64-linux-gnu/haswell/glibc-hwcaps/x86-64-v3/value.so', []],
    ['/pack/lib/x86_64-linux-gnu/haswell/value.so', [[1, '/outside/unused.so']]],
  ], { environment: { hardwareCapabilities: ['x86-64-v4', 'x86-64-v3'] } });
  expect(check).not.toThrow();
  expect(reads).toContain('/pack/lib/x86_64-linux-gnu/haswell/glibc-hwcaps/x86-64-v4/value.so');
  expect(reads).not.toContain('/pack/lib/x86_64-linux-gnu/haswell/value.so');
});

it('uses a selected OS cache entry before default directories', () => {
  const { check, cache, reads } = admission([[1, 'libvalue.so']], [['/usr/lib/libvalue.so', []]], {
    cached: '/usr/lib/libvalue.so',
  });
  expect(check).not.toThrow();
  expect(cache).toEqual(['libvalue.so']);
  expect(reads).not.toContain('/lib/x86_64-linux-gnu/libvalue.so');
});

it('refuses a selected external cache entry instead of treating its name as an OS library', () => {
  const { check } = admission([[1, 'libc.so.6']], [['/outside/libc.so.6', []]], { cached: '/outside/libc.so.6' });
  expect(check).toThrow('selects "/outside/libc.so.6" outside its captured package');
});

it('honors NODEFLIB for both cache selections and default search', () => {
  const { check, reads } = admission([[1, 'value.so'], [0x6ffffffb, 0x800]], [['/lib/x86_64-linux-gnu/value.so', []]], {
    cached: '/lib/x86_64-linux-gnu/value.so',
  });
  expect(check).toThrow('cannot be resolved before native initialization');
  expect(reads).not.toContain('/lib/x86_64-linux-gnu/value.so');
});

it('checks physical OS selections rather than trusting their lexical prefix', () => {
  const { check } = admission([[1, '/usr/lib/value.so']], [['/usr/lib/value.so', []]], {
    physical: file => file === '/usr/lib/value.so' ? '/outside/value.so' : file,
  });
  expect(check).toThrow('outside its captured package');
});

it('uses already loaded OS images without searching unused external overrides', () => {
  const { check, reads } = admission([[1, 'value.so']], [], {
    loaded: '/usr/lib/value.so', environment: { libraryPaths: ['/outside'] },
  });
  expect(check).not.toThrow();
  expect(reads).not.toContain('/outside/value.so');
});

it('ignores missing optional auxiliary images but refuses a selected outside auxiliary image', () => {
  expect(admission([[0x7ffffffd, 'missing.so']]).check).not.toThrow();
  expect(admission([[0x7ffffffd, '/outside/aux.so']], [['/outside/aux.so', []]]).check).toThrow('outside its captured package');
});

it.each([0x7fffffff, 0x6ffffefb, 0x6ffffefc])('checks declared filter/audit images for tag %i', tag => {
  const { check } = admission([[tag, '$ORIGIN/../lib/value.so']], [
    ['/pack/lib/value.so', [[1, '/outside/transitive.so']]],
  ]);
  expect(check).toThrow('references "/outside/transitive.so"');
});
