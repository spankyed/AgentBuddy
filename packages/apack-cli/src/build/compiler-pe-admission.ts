import { win32 as path } from 'node:path';
import { parsePeLibraryMetadata, type PeImportedSymbol, type PeLibraryMetadata } from './compiler-pe-libraries.ts';
import { resolvePeApiSet } from './compiler-pe-api-sets.ts';
import { peLibraryPaths, pePath, type CompilerPeEnvironment } from './compiler-pe-environment.ts';

/** Node uses LOAD_WITH_ALTERED_SEARCH_PATH: transitive imports share the top image's directory. */
export function assertCapturedPeLibraries(entry: string, packageRoot: string, input: {
  environment: CompilerPeEnvironment;
  executable: string;
  cwd: string;
  variables: NodeJS.ProcessEnv;
  loadedLibraries: readonly string[];
  arch: string;
  read(file: string): Buffer | undefined;
  directoryExists(file: string): boolean;
  realpath(file: string): string;
}): void {
  const environment = input.environment;
  const within = (file: string, root: string) => {
    const relative = path.relative(pePath(root), pePath(file));
    return relative === '' || (relative !== '..' && !relative.startsWith('..\\') && !path.isAbsolute(relative));
  };
  const system = (file: string) => within(file, environment.systemDirectory)
    || within(file, path.join(environment.windowsDirectory, 'WinSxS'))
    || path.dirname(pePath(file)).toLowerCase() === pePath(environment.windowsDirectory).toLowerCase();
  const root = input.realpath(packageRoot);
  const images = new Map<string, PeLibraryMetadata>();
  const symbols = new Set<string>();
  const refuse = (requester: string, file: string): never => {
    throw new Error(`Native compiler image "${requester}" selects "${file}" outside its captured package. Use package-contained DLLs or operating-system libraries.`);
  };
  const marker = input.executable + '.local';
  const markerFile = input.read(marker);
  const markerDirectory = input.directoryExists(marker);
  let redirectionDirectory: string | undefined;
  if (markerFile !== undefined || markerDirectory) {
    const externalManifest = input.read(input.executable + '.manifest');
    const executable = input.read(input.executable);
    if (!executable) throw new Error(`Cannot inspect Windows redirection for "${input.executable}"`);
    const embeddedManifest = parsePeLibraryMetadata(executable).manifests.some(manifest => manifest.path[1] === 1);
    if (environment.devOverride || (!embeddedManifest && externalManifest === undefined)) {
      redirectionDirectory = markerDirectory ? marker : path.dirname(input.executable);
    }
  }
  const redirected = (name: string) => {
    if (!redirectionDirectory) return;
    const file = path.join(redirectionDirectory, path.basename(name));
    return input.read(file) !== undefined ? file : undefined;
  };
  const selectedEntry = pePath(entry).toLowerCase() === pePath(input.executable).toLowerCase() ? entry : redirected(entry) ?? entry;
  const read = (file: string, requester: string): PeLibraryMetadata | undefined => {
    // NAPI imports resolve against the running executable, already owned by the installation.
    // Do not record its private copy as another package's source input.
    if (file !== entry && pePath(file).toLowerCase() === pePath(input.executable).toLowerCase()) return;
    const identity = file.toLowerCase();
    const known = images.get(identity);
    if (known) return known;
    const bytes = input.read(file);
    if (bytes === undefined) return;
    const physical = input.realpath(file);
    if (system(file) && system(physical)) return;
    if (!within(file, packageRoot) || !within(physical, root)) refuse(requester, file);
    let metadata: PeLibraryMetadata;
    try { metadata = parsePeLibraryMetadata(bytes); }
    catch (error) { throw new Error(`Cannot inspect native compiler image "${file}"`, { cause: error }); }
    const machine = input.arch === 'x64' ? 0x8664 : input.arch === 'arm64' ? 0xaa64 : input.arch === 'ia32' ? 0x14c : undefined;
    if (metadata.machine !== machine) throw new Error(`Native compiler image "${file}" has no PE code for ${input.arch}`);
    images.set(identity, metadata);
    for (const imported of metadata.imports) {
      const target = resolve(imported.name, file);
      if (target) inspect(target, imported.symbols, file);
    }
    return metadata;
  };
  const resolve = (reference: string, requester: string): string | undefined => {
    let name = reference.replace(/ +$/, '');
    if (!path.extname(name)) name += '.dll';
    const local = redirected(name);
    if (local) return local;
    const mapped = resolvePeApiSet(environment.apiSets, name, path.basename(requester));
    if (mapped !== undefined) {
      if (!mapped) throw new Error(`Native compiler image "${requester}" references unavailable Windows API set "${name}"`);
      name = mapped;
    }
    // Copying an image cannot relocate an absolute import encoded in its bytes.
    if (path.isAbsolute(name) && !system(name)) refuse(requester, name);
    const bare = path.basename(name) === name;
    const loaded = [input.executable, ...input.loadedLibraries].find(file => bare && path.basename(file).toLowerCase() === name.toLowerCase());
    if (loaded) return loaded;
    if (bare && environment.knownDlls.includes(name.toLowerCase())) return path.join(environment.systemDirectory, name);
    const systemDirectories = [environment.systemDirectory, path.join(environment.windowsDirectory, 'System'), environment.windowsDirectory];
    const directories = [path.dirname(selectedEntry), ...(environment.safeSearch ? systemDirectories : [input.cwd, ...systemDirectories]),
      ...(environment.safeSearch ? [input.cwd] : []), ...peLibraryPaths(input.variables)];
    const candidates = path.isAbsolute(name) ? [name] : directories.map(directory => path.resolve(input.cwd, directory, name));
    return candidates.find(file => input.read(file) !== undefined);
  };
  const inspect = (file: string, requested: readonly PeImportedSymbol[], requester: string) => {
    const metadata = read(file, requester);
    if (!metadata) return;
    for (const symbol of requested) {
      if ('boundAddress' in symbol) throw new Error(`Cannot inspect bound-only PE import from "${requester}" into "${file}" without its import names`);
      const key = `${file.toLowerCase()}\0${'name' in symbol ? symbol.name : '#' + symbol.ordinal}`;
      if (symbols.has(key)) continue;
      symbols.add(key);
      const exported = metadata.exports.find(exported => 'name' in symbol ? exported.names.includes(symbol.name) : exported.ordinal === symbol.ordinal);
      if (!exported?.forwarder) continue;
      const split = exported.forwarder.lastIndexOf('.');
      if (split <= 0 || split === exported.forwarder.length - 1) throw new Error(`Invalid PE export forwarder in "${file}"`);
      const name = exported.forwarder.slice(split + 1), target = resolve(exported.forwarder.slice(0, split), file);
      if (name.startsWith('#') && !/^#\d+$/.test(name)) throw new Error(`Invalid PE export ordinal in "${file}"`);
      if (target) inspect(target, [name.startsWith('#') ? { ordinal: Number(name.slice(1)) } : { name }], file);
    }
  };
  // The schema is an input even when this particular addon uses only ordinary DLL names.
  input.read(environment.schema);
  inspect(selectedEntry, [{ name: 'napi_register_module_v1' }, { name: `node_register_module_v${process.versions.modules}` }], entry);
}
