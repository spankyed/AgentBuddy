import { posix as path } from 'node:path';
import fs from 'node:fs';

interface NativeLibraryCommands {
  dependencies: string[];
  rpaths: string[];
}

export interface MachOLibraryEnvironment {
  readonly libraryPaths: readonly string[];
  readonly fallbackLibraryPaths: readonly string[];
}

/** dyld reads these settings at process launch, before user preloads can change process.env. */
export function captureMachOLibraryEnvironment(env: NodeJS.ProcessEnv = process.env): MachOLibraryEnvironment {
  return Object.freeze({
    libraryPaths: Object.freeze(env.DYLD_LIBRARY_PATH ? env.DYLD_LIBRARY_PATH.split(':') : []),
    fallbackLibraryPaths: Object.freeze(env.DYLD_FALLBACK_LIBRARY_PATH ? env.DYLD_FALLBACK_LIBRARY_PATH.split(':') : []),
  });
}

const systemLibrary = (file: string) => file.startsWith('/usr/lib/') || file.startsWith('/System/Library/');

/** Inserted libraries execute before JS admission; live package paths cannot select captured bytes. */
export function assertCompilerLibraryInsertion(env: NodeJS.ProcessEnv = process.env): void {
  if (process.platform !== 'darwin') return;
  for (const library of env.DYLD_INSERT_LIBRARIES?.split(':').filter(Boolean) ?? []) {
    if (!path.isAbsolute(library) || !systemLibrary(path.normalize(library))) {
      throw new Error(`Cannot launch captured compiler: DYLD_INSERT_LIBRARIES references "${library}" outside its captured installation. Use operating-system libraries or load package libraries through captured compiler modules.`);
    }
    assertCapturedMachOLibraries(library, path.dirname(library), { arch: process.arch,
      environment: captureMachOLibraryEnvironment(env), realpath: file => fs.realpathSync(file),
      read: file => fs.statSync(file, { throwIfNoEntry: false })?.isFile() ? fs.readFileSync(file) : undefined,
    });
  }
}

/** Inspect dependency commands, never LC_ID_DYLIB or executable code. */
export function parseMachOLibraryCommands(bytes: Buffer, arch: string): NativeLibraryCommands {
  const invalid = () => new Error('Invalid Mach-O native library commands');
  if (bytes.length < 4) throw invalid();
  const magic = bytes.readUInt32BE(0);
  if ([0xcafebabe, 0xcafebabf, 0xbebafeca, 0xbfbafeca].includes(magic)) {
    const little = magic === 0xbebafeca || magic === 0xbfbafeca;
    const wide = magic === 0xcafebabf || magic === 0xbfbafeca;
    const uint = (offset: number) => little ? bytes.readUInt32LE(offset) : bytes.readUInt32BE(offset);
    if (bytes.length < 8) throw invalid();
    const count = uint(4), size = wide ? 32 : 20;
    if (count > (bytes.length - 8) / size) throw invalid();
    const cpu = arch === 'arm64' ? 0x100000c : arch === 'x64' ? 0x1000007 : undefined;
    for (let i = 0; i < count; i++) {
      const entry = 8 + i * size;
      if (uint(entry) !== cpu) continue;
      const offset = wide ? Number(little ? bytes.readBigUInt64LE(entry + 8) : bytes.readBigUInt64BE(entry + 8)) : uint(entry + 8);
      const length = wide ? Number(little ? bytes.readBigUInt64LE(entry + 16) : bytes.readBigUInt64BE(entry + 16)) : uint(entry + 12);
      if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || length < 4 || offset < 8 + count * size || offset + length > bytes.length) throw invalid();
      return parseMachOLibraryCommands(bytes.subarray(offset, offset + length), arch);
    }
    throw new Error(`Native library has no Mach-O slice for ${arch}`);
  }
  const little = magic === 0xcefaedfe || magic === 0xcffaedfe;
  const wide = magic === 0xfeedfacf || magic === 0xcffaedfe;
  if (![0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe].includes(magic)) throw invalid();
  const uint = (offset: number) => little ? bytes.readUInt32LE(offset) : bytes.readUInt32BE(offset);
  const header = wide ? 32 : 28;
  if (bytes.length < header) throw invalid();
  const count = uint(16), end = header + uint(20);
  if (end > bytes.length || count > (end - header) / 8) throw invalid();
  const result: NativeLibraryCommands = { dependencies: [], rpaths: [] };
  let cursor = header;
  for (let i = 0; i < count; i++) {
    if (cursor + 8 > end) throw invalid();
    const command = uint(cursor) & 0x7fffffff, size = uint(cursor + 4);
    if (size < 8 || cursor + size > end) throw invalid();
    const target = command === 0x1c ? result.rpaths
      : [0xc, 0x18, 0x1f, 0x20, 0x23].includes(command) ? result.dependencies : undefined;
    if (target) {
      const minimum = command === 0x1c ? 12 : 24;
      if (size < minimum) throw invalid();
      const start = uint(cursor + 8);
      if (start < minimum || start >= size) throw invalid();
      const zero = bytes.indexOf(0, cursor + start);
      if (zero < 0 || zero >= cursor + size) throw invalid();
      target.push(bytes.toString('utf8', cursor + start, zero));
    }
    cursor += size;
  }
  if (cursor !== end) throw invalid();
  return result;
}

/** Refuse identifiable escapes; this is not confinement of native I/O or computed dlopen calls. */
export function assertCapturedMachOLibraries(entry: string, packageRoot: string, input: {
  read(file: string): Buffer | undefined;
  realpath(file: string): string;
  arch: string;
  environment?: MachOLibraryEnvironment;
}) {
  const within = (file: string, root = packageRoot) => {
    const relative = path.relative(root, file);
    return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
  };
  const environment = input.environment ?? captureMachOLibraryEnvironment();
  const search = (reference: string, requester: string, directories: readonly string[], variable: string) => {
    // Framework overrides use DYLD_FRAMEWORK_PATH, not the dylib basename search.
    if (/([^/]+)\.framework\/(?:Versions\/[^/]+\/)?\1$/.test(reference)) return false;
    for (const directory of directories) {
      const candidate = path.resolve(`${directory}/${path.basename(reference)}`);
      if (input.read(candidate) === undefined) continue;
      if (systemLibrary(candidate) && systemLibrary(input.realpath(candidate))) return true;
      throw new Error(`Native compiler image "${requester}" selects "${candidate}" through ${variable} outside its captured package. Use package-relative native libraries or operating-system libraries.`);
    }
    return false;
  };
  const visited = new Set<string>();
  function inspect(file: string, inherited: readonly { reference: string; expanded: string }[]) {
    if (visited.has(file)) return true;
    const bytes = input.read(file);
    if (!bytes) return false;
    visited.add(file); // The operating-system loader supplies missing-library diagnostics.
    let commands: NativeLibraryCommands;
    try { commands = parseMachOLibraryCommands(bytes, input.arch); }
    catch (error) { throw new Error(`Cannot inspect native compiler image "${file}"`, { cause: error }); }
    const refuse = (reference: string): never => {
      throw new Error(`Native compiler image "${file}" references "${reference}" outside its captured package. Use package-relative native libraries or operating-system libraries.`);
    };
    const expand = (reference: string): string | undefined => {
      if (reference.startsWith('@loader_path/')) return path.resolve(path.dirname(file), reference.slice(13));
      if (reference.startsWith('@executable_path/')) return path.resolve(path.dirname(process.execPath), reference.slice(17));
      if (path.isAbsolute(reference)) return path.resolve(reference);
    };
    const rpaths = [...commands.rpaths.flatMap(reference => {
      const expanded = expand(reference);
      return expanded ? [{ reference, expanded }] : [];
    }), ...inherited];
    for (const reference of commands.dependencies) {
      if (search(reference, file, environment.libraryPaths, 'DYLD_LIBRARY_PATH')) continue;
      if (path.isAbsolute(reference)) {
        if (!systemLibrary(path.resolve(reference))) refuse(reference);
        continue;
      }
      if (!reference.startsWith('@') && reference.includes('/')) refuse(reference);
      const bare = !reference.startsWith('@');
      const candidates = reference.startsWith('@rpath/')
        ? rpaths.map(({ reference: search, expanded }) => ({ file: path.resolve(expanded, reference.slice(7)), search }))
        : [{ file: bare ? path.resolve(reference) : expand(reference), search: undefined }];
      let found = false;
      for (const { file: candidate, search } of candidates) {
        if (!candidate || (bare && input.read(candidate) === undefined)) continue;
        if (systemLibrary(candidate)) { found = true; break; }
        if (search && path.isAbsolute(search)) refuse(search);
        if (!within(candidate) || !within(input.realpath(candidate), input.realpath(packageRoot))) refuse(reference);
        if (inspect(candidate, rpaths)) { found = true; break; }
      }
      if (!found) search(reference, file, environment.fallbackLibraryPaths, 'DYLD_FALLBACK_LIBRARY_PATH');
    }
    return true;
  }
  if (!search(entry, entry, environment.libraryPaths, 'DYLD_LIBRARY_PATH')) inspect(entry, []);
}
