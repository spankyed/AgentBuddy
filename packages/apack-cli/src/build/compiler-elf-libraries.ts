import { posix as path } from 'node:path';

export interface ElfLibraryCommands {
  readonly machine: number;
  readonly dependencies: string[];
  readonly soname?: string;
  readonly rpath?: string;
  readonly runpath?: string;
  readonly flags1: number;
  readonly auxiliary: string[];
  readonly filters: string[];
  readonly audit?: string;
  readonly dependencyAudit?: string;
}

export interface ElfLibraryEnvironment {
  readonly cwd: string;
  readonly executable: string;
  readonly libraryPaths: readonly string[];
  readonly libraryToken: string;
  readonly platformToken: string;
  readonly hardwareCapabilities: readonly string[];
  readonly systemDirectories: readonly string[];
  readonly executableRpath: readonly string[];
}

interface ElfLibraryInput {
  readonly environment: ElfLibraryEnvironment;
  read(file: string): Buffer | undefined;
  realpath(file: string): string;
  /** Loader-selected cache entry, before DF_1_NODEFLIB filtering and existence checking. */
  cachedLibrary(name: string, machine: number): string | undefined;
  /** Already loaded images are selected before any filesystem search. */
  loadedLibrary(name: string): string | undefined;
}

const systemLibrary = (file: string) => ['/lib/', '/lib64/', '/usr/lib/', '/usr/lib64/'].some(root => file.startsWith(root));

/** Static admission only. The existing owner captures reads; the OS remains the executable loader. */
export function assertCapturedElfLibraries(entry: string, packageRoot: string, input: ElfLibraryInput): void {
  const environment = input.environment;
  const within = (file: string, root: string) => {
    const relative = path.relative(root, file);
    return relative === '' || (relative !== '..' && !relative.startsWith('../') && !path.isAbsolute(relative));
  };
  const refuse = (file: string, reference: string, detail: string): never => {
    throw new Error(`Native compiler image "${file}" references "${reference}" ${detail}. Use captured package-relative native libraries or operating-system libraries.`);
  };
  const expand = (reference: string, requester: string) => reference.replace(
    /\$(?:\{(ORIGIN|LIB|PLATFORM)\}|(ORIGIN|LIB|PLATFORM)(?![A-Za-z0-9_]))/g,
    (_match, quoted: string | undefined, bare: string | undefined) => {
      switch (quoted ?? bare) {
        case 'ORIGIN': return path.dirname(requester);
        case 'LIB': return environment.libraryToken;
        default:
          if (!environment.platformToken) refuse(requester, reference, 'uses PLATFORM without a loader-supplied platform token');
          return environment.platformToken;
      }
    },
  );
  type SearchPath = { directory: string; relocatable: boolean };
  const searchPaths = (references: readonly string[], requester: string): SearchPath[] => references.flatMap(reference =>
    reference.split(':').map(directory => ({
      directory: path.resolve(environment.cwd, expand(directory, requester)),
      relocatable: /^\$(?:ORIGIN(?![A-Za-z0-9_])|\{ORIGIN\})(?:\/|$)/.test(directory)
        && within(requester, packageRoot),
    })),
  );
  const visited = new Set<string>();
  const queue: { file: string; inherited: SearchPath[] }[] = [{ file: entry, inherited: [] }];
  // Breadth-first dependency order matches ELF discovery; cycles share the first selected image.
  const selected = new Map<string, string>();
  while (queue.length) {
    const { file, inherited } = queue.shift()!;
    if (visited.has(file)) continue;
    visited.add(file);
    const bytes = input.read(file) ?? refuse(file, file, 'cannot be read before native initialization');
    let commands: ElfLibraryCommands;
    try { commands = parseElfLibraryCommands(bytes); }
    catch (error) { throw new Error(`Cannot inspect native compiler image "${file}"`, { cause: error }); }
    const rpaths = commands.runpath === undefined
      ? [...searchPaths(commands.rpath === undefined ? [] : [commands.rpath], file), ...inherited] : inherited;
    const paths = [
      ...(commands.runpath === undefined ? [...rpaths, ...searchPaths(environment.executableRpath, environment.executable)] : []),
      ...searchPaths(environment.libraryPaths, environment.executable),
      ...searchPaths(commands.runpath === undefined ? [] : [commands.runpath], file),
    ];
    const admit = (candidate: string, reference: string, relocatable: boolean) => {
      const physical = input.realpath(candidate);
      if (systemLibrary(candidate) && systemLibrary(physical) && !relocatable) return;
      if (!relocatable || !within(candidate, packageRoot) || !within(physical, input.realpath(packageRoot))) {
        refuse(file, reference, `selects "${candidate}" outside its captured package`);
      }
      queue.push({ file: candidate, inherited: rpaths });
    };
    const find = (reference: string): { file: string; relocatable: boolean } | undefined => {
      const loaded = selected.get(reference) ?? input.loadedLibrary(reference);
      if (loaded) return { file: loaded, relocatable: within(loaded, packageRoot) };
      const expanded = expand(reference, file);
      if (expanded.includes('/')) {
        const candidate = path.resolve(environment.cwd, expanded);
        const relocatable = /^\$(?:ORIGIN(?![A-Za-z0-9_])|\{ORIGIN\})(?:\/|$)/.test(reference);
        // An absolute source-package path will still point to the original after capture.
        if (!relocatable && !systemLibrary(candidate)) refuse(file, reference, 'outside its captured package');
        return input.read(candidate) === undefined ? undefined : { file: candidate, relocatable };
      }
      const search = (paths: readonly SearchPath[]) => {
        for (const { directory, relocatable } of paths) {
          for (const suffix of [...environment.hardwareCapabilities.map(name => `glibc-hwcaps/${name}/`), '']) {
            const candidate = path.join(directory, suffix, expanded);
            if (input.read(candidate) !== undefined) return { file: candidate, relocatable };
          }
        }
      };
      const found = search(paths);
      if (found) return found;
      const noDefaults = (commands.flags1 & 0x800) !== 0;
      const cached = input.cachedLibrary(expanded, commands.machine);
      if (cached && (!noDefaults || !environment.systemDirectories.some(directory => within(cached, directory)))) {
        if (input.read(cached) !== undefined) return { file: cached, relocatable: false };
      }
      return noDefaults ? undefined : search(searchPaths(environment.systemDirectories, environment.executable));
    };
    const references = [
      ...commands.dependencies.map(reference => ({ reference, optional: false })),
      ...commands.filters.map(reference => ({ reference, optional: false })),
      ...commands.auxiliary.map(reference => ({ reference, optional: true })),
      ...[commands.audit, commands.dependencyAudit].flatMap(value => value === undefined ? []
        : value.split(':').map(reference => ({ reference, optional: false }))),
    ];
    for (const { reference, optional } of references) {
      const result = find(reference);
      if (!result) { if (!optional) refuse(file, reference, 'cannot be resolved before native initialization'); continue; }
      admit(result.file, reference, result.relocatable);
      selected.set(reference, result.file);
    }
  }
}

function readElfProgramHeaders(bytes: Buffer) {
  const invalid = () => new Error('Invalid ELF native library commands');
  const range = (offset: number, length: number) => {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0
      || offset > bytes.length || length > bytes.length - offset) throw invalid();
  };
  range(0, 16);
  if (bytes.toString('hex', 0, 4) !== '7f454c46' || ![1, 2].includes(bytes[4])
    || ![1, 2].includes(bytes[5]) || bytes[6] !== 1) throw invalid();
  const wide = bytes[4] === 2, little = bytes[5] === 1;
  const uint16 = (offset: number) => little ? bytes.readUInt16LE(offset) : bytes.readUInt16BE(offset);
  const uint32 = (offset: number) => little ? bytes.readUInt32LE(offset) : bytes.readUInt32BE(offset);
  const word = (offset: number) => {
    const value = wide ? Number(little ? bytes.readBigUInt64LE(offset) : bytes.readBigUInt64BE(offset)) : uint32(offset);
    if (!Number.isSafeInteger(value)) throw invalid();
    return value;
  };
  const headerSize = wide ? 64 : 52, programSize = wide ? 56 : 32;
  range(0, headerSize);
  if (![2, 3].includes(uint16(16)) || uint32(20) !== 1
    || uint16(wide ? 52 : 40) !== headerSize) throw invalid();
  const start = word(wide ? 32 : 28), size = uint16(wide ? 54 : 42);
  let count = uint16(wide ? 56 : 44);
  if (count === 0xffff) {
    const section = word(wide ? 40 : 32), sectionSize = wide ? 64 : 40;
    if (section < headerSize || uint16(wide ? 58 : 46) < sectionSize) throw invalid();
    range(section, sectionSize);
    count = uint32(section + (wide ? 44 : 28));
  }
  if (size < programSize || start < headerSize) throw invalid();
  range(start, size * count);
  const loads: { offset: number; address: number; size: number }[] = [];
  let dynamic: { offset: number; size: number } | undefined;
  let interpreter: { offset: number; size: number } | undefined;
  for (let i = 0; i < count; i++) {
    const at = start + i * size, type = uint32(at);
    if (type !== 1 && type !== 2 && type !== 3) continue;
    const offset = word(at + (wide ? 8 : 4)), address = word(at + (wide ? 16 : 8));
    const fileSize = word(at + (wide ? 32 : 16)), memorySize = word(at + (wide ? 40 : 20));
    range(offset, fileSize);
    if (fileSize > memorySize) throw invalid();
    if (type === 1) loads.push({ offset, address, size: fileSize });
    else if (type === 2) {
      if (dynamic) throw invalid();
      dynamic = { offset, size: fileSize };
    } else {
      if (interpreter) throw invalid();
      interpreter = { offset, size: fileSize };
    }
  }
  return { machine: uint16(18), wide, little, loads, dynamic, interpreter, word, invalid, range };
}

export function parseElfInterpreter(bytes: Buffer): string {
  const { interpreter, invalid } = readElfProgramHeaders(bytes);
  if (!interpreter || interpreter.size < 2 || bytes[interpreter.offset + interpreter.size - 1] !== 0) throw invalid();
  const value = bytes.toString('utf8', interpreter.offset, interpreter.offset + interpreter.size - 1);
  if (!path.isAbsolute(value) || value.includes('\0')) throw invalid();
  return value;
}

/** Read file-backed dynamic metadata, including stripped images; never load or execute the image. */
export function parseElfLibraryCommands(bytes: Buffer): ElfLibraryCommands {
  const { machine, wide, little, loads, dynamic, word, invalid, range } = readElfProgramHeaders(bytes);
  if (!dynamic) throw new Error('ELF native library has no dynamic segment');
  const entrySize = wide ? 16 : 8;
  if (!dynamic.size || dynamic.size % entrySize !== 0) throw invalid();
  const entries = new Map<number, number[]>();
  let terminated = false;
  for (let at = dynamic.offset; at < dynamic.offset + dynamic.size; at += entrySize) {
    const tag = wide ? Number(little ? bytes.readBigInt64LE(at) : bytes.readBigInt64BE(at))
      : little ? bytes.readInt32LE(at) : bytes.readInt32BE(at);
    if (tag === 0) { terminated = true; break; }
    // Ignore unrelated values, whose pointers or signed encodings need not fit a JS number.
    if (![1, 5, 10, 14, 15, 29, 0x6ffffffb, 0x6ffffefb, 0x6ffffefc, 0x7ffffffd, 0x7fffffff].includes(tag)) continue;
    const values = entries.get(tag) ?? [];
    values.push(word(at + entrySize / 2));
    entries.set(tag, values);
  }
  if (!terminated) throw invalid();
  const single = (tag: number) => {
    const values = entries.get(tag);
    if (values && values.length !== 1) throw invalid();
    return values?.[0];
  };
  const address = single(5), stringSize = single(10);
  if (address === undefined || stringSize === undefined || stringSize === 0) throw invalid();
  const load = loads.find(load => address >= load.address && address - load.address <= load.size
    && stringSize <= load.size - (address - load.address));
  if (!load) throw invalid();
  const strings = load.offset + address - load.address;
  range(strings, stringSize);
  const string = (offset: number) => {
    if (offset >= stringSize) throw invalid();
    const zero = bytes.indexOf(0, strings + offset);
    if (zero < 0 || zero >= strings + stringSize) throw invalid();
    return bytes.toString('utf8', strings + offset, zero);
  };
  const optionalString = (tag: number) => {
    const offset = single(tag);
    return offset === undefined ? undefined : string(offset);
  };
  return {
    machine, dependencies: (entries.get(1) ?? []).map(string), soname: optionalString(14),
    rpath: optionalString(15), runpath: optionalString(29), flags1: single(0x6ffffffb) ?? 0,
    auxiliary: (entries.get(0x7ffffffd) ?? []).map(string), filters: (entries.get(0x7fffffff) ?? []).map(string),
    audit: optionalString(0x6ffffefc), dependencyAudit: optionalString(0x6ffffefb),
  };
}
