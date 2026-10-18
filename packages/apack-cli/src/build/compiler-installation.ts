import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readPackageInputs } from '@apackdev/host/build/package-inputs';
import { cliPackageDirectory } from './tool-identity.ts';
import { compilerRuntimeFileSystem as fs, readCompilerRuntimeInputs } from './compiler-runtime.ts';

export interface CompilerInstallation {
  readonly bin: string;
  readonly executable: string;
  readonly runtimeDirectory: string;
  readonly hash: string;
  readonly inputsFile: string;
  readonly environment: Readonly<Pick<NodeJS.ProcessEnv, 'ESBUILD_BINARY_PATH'>>;
  isCurrent(directory: string, options?: CompilerInstallationOptions): boolean;
  dispose(): Promise<void>;
}

interface CompilerInstallationOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

function compilerPackagesHash(directory: string): string {
  return readPackageInputs([{ id: 'compiler', directory, contents: true }]).hash;
}

export function readEsbuildOverride({ cwd = process.cwd(), env = process.env }: CompilerInstallationOptions) {
  const value = env.ESBUILD_BINARY_PATH;
  // esbuild deliberately ignores this system path, even when it exists.
  if (!value || value === '/usr/bin/esbuild') return;
  const file = path.resolve(cwd, value);
  try {
    const source = fs.realpathSync.native(file);
    const stat = fs.statSync(source);
    if (!stat.isFile()) throw new Error(`esbuild executable is not a file: ${file}`);
    return { kind: 'file' as const, file, source, mode: stat.mode & 0o777, bytes: fs.readFileSync(source) };
  } catch (error) {
    if (!['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
    return { kind: 'missing' as const, file };
  }
}

function executableIdentity(root: string, executable: ReturnType<typeof readEsbuildOverride>) {
  if (!executable) return null;
  return [path.relative(root, executable.file), executable.kind === 'missing' ? null
    : [path.relative(root, executable.source), executable.mode & 0o111, createHash('sha256').update(executable.bytes).digest('hex')]];
}

/** A checkout builds the same distributable worker that an installed CLI runs. */
export function compilerPackageDirectory(root = cliPackageDirectory()): string {
  const directory = fs.existsSync(path.join(root, 'dist/cli.js')) ? root : path.join(root, 'dist/package');
  if (!fs.existsSync(path.join(directory, 'dist/build-worker.js'))) {
    throw new Error(`Missing pack compiler at ${directory}; build the CLI package before compiling packs`);
  }
  return fs.realpathSync.native(directory);
}

/** Capture before startup: normal Node loading reads private copies, never mutable compiler originals. */
export async function captureCompilerInstallation(directory = compilerPackageDirectory(), options: CompilerInstallationOptions = {}): Promise<CompilerInstallation> {
  directory = fs.realpathSync.native(directory);
  const temporary = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'apack-compiler-')));
  const paths = new Map<string, string>();
  const capturedPath = (source: string) => {
    const root = path.parse(source).root;
    const captured = path.join(temporary, 'tree', Buffer.from(root).toString('hex'));
    paths.set(captured, root);
    return path.join(captured, path.relative(root, source));
  };
  const copied = new Map<string, string>();
  const directories = new Set<string>();
  const dispose = async () => {
    await Promise.all([...directories].map(async directory => {
      try { await fs.promises.chmod(directory, 0o700); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }));
    await fs.promises.rm(temporary, { recursive: true, force: true });
  };
  const mkdir = (directory: string) => {
    if (directories.has(directory)) return;
    fs.mkdirSync(directory, { recursive: true });
    for (let current = directory; !directories.has(current); current = path.dirname(current)) {
      directories.add(current);
      if (current === temporary) break;
    }
  };
  try {
    const copy = ({ source, mode, hash }: { source: string; mode: number; hash: string }, bytes: Buffer, clone = false) => {
      const identity = `${mode}:${hash}`;
      const previous = copied.get(source);
      if (previous !== undefined) {
        if (previous !== identity) throw new Error(`Compiler input changed during capture: ${source}`);
        return;
      }
      const target = capturedPath(source);
      mkdir(path.dirname(target));
      if (clone) fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL | fs.constants.COPYFILE_FICLONE);
      else fs.writeFileSync(target, bytes, { flag: 'wx', mode: mode & ~0o222 });
      fs.chmodSync(target, mode & ~0o222);
      copied.set(source, identity);
    };
    const inputs = readPackageInputs([{ id: 'compiler', directory, contents: true }], { onFile: copy });
    const runtime = readCompilerRuntimeInputs(process.execPath, !!process.versions.electron, (file, bytes) => copy(file, bytes, true));
    for (const directory of runtime.directories) mkdir(capturedPath(directory));
    const executable = readEsbuildOverride(options);
    const executableId = JSON.stringify(executableIdentity(directory, executable));
    if (executable?.kind === 'file') {
      copy({ source: executable.source, mode: executable.mode,
        hash: createHash('sha256').update(executable.bytes).digest('hex') }, executable.bytes);
    } else if (executable) {
      console.warn(`[esbuild] Ignoring bad configuration: ESBUILD_BINARY_PATH=${(options.env ?? process.env).ESBUILD_BINARY_PATH}`);
    }
    const environment = Object.freeze({ ESBUILD_BINARY_PATH: executable?.kind === 'file' ? capturedPath(executable.source) : undefined });
    const links = new Map<string, string>();
    const addLink = (source: string, target: string) => {
      if (source === target) return;
      const previous = links.get(source);
      if (previous !== undefined && previous !== target) throw new Error(`Compiler link changed during capture: ${source}`);
      links.set(source, target);
    };
    for (const node of inputs.nodes) {
      for (const directory of node.directories) mkdir(capturedPath(directory.source));
      for (const link of node.links) addLink(path.join(node.directory, link.path), link.target);
      for (const [name, index] of Object.entries(node.dependencies)) {
        if (index === null) continue;
        const lookup = node.lookups[name]!;
        addLink(lookup, inputs.nodes[index]!.directory);
        const paths = createRequire(capturedPath(path.join(node.directory, 'package.json'))).resolve.paths(name) ?? [];
        // Node's global search paths are outside the mirrored ancestry; bind those dependencies locally.
        if (!paths.some(directory => path.join(directory, name) === capturedPath(lookup))) {
          addLink(path.join(node.directory, 'node_modules', name), inputs.nodes[index]!.directory);
        }
      }
    }
    const runtimeLinks = new Map(runtime.links.map(link => [link.source, link.text]));
    for (const { source, target } of runtime.links) addLink(source, target);
    // Parent links first: a child lookup may already exist through its captured parent.
    for (const [source, target] of [...links].sort(([a], [b]) => a.length - b.length)) {
      const destination = capturedPath(source);
      const resolved = capturedPath(target);
      mkdir(path.dirname(destination));
      const existing = fs.lstatSync(destination, { throwIfNoEntry: false });
      if (existing) {
        if (existing.isSymbolicLink() && path.resolve(path.dirname(destination), fs.readlinkSync(destination)) === resolved) continue;
        if (fs.realpathSync.native(destination) !== fs.realpathSync.native(resolved)) throw new Error(`Conflicting captured compiler path: ${source}`);
      } else {
        const directoryType = process.platform === 'win32' ? 'junction' : 'dir';
        const text = runtimeLinks.get(source);
        // Relative framework links are sealed by macOS signatures; keep their exact spelling.
        const link = process.platform !== 'win32' && text !== undefined && !path.isAbsolute(text) ? text : resolved;
        fs.symlinkSync(link, destination, fs.statSync(resolved, { throwIfNoEntry: false })?.isDirectory() ? directoryType : 'file');
      }
    }
    const root = capturedPath(inputs.nodes[inputs.roots[0]!.node]!.directory);
    const verified = readPackageInputs([{ id: 'compiler', directory: root, contents: true }]);
    if (verified.hash !== inputs.hash || verified.nodes.some(node => !node.directory.startsWith(`${temporary}${path.sep}`))) {
      throw new Error('Captured compiler installation differs from its inputs');
    }
    const hash = createHash('sha256').update(JSON.stringify([inputs.hash, executableId, runtime.hash])).digest('hex');
    const inputsFile = path.join(temporary, 'compiler-inputs.json');
    fs.writeFileSync(inputsFile, JSON.stringify({ hash,
      packages: inputs.nodes.map(node => capturedPath(node.directory)),
      paths: [...paths].map(([captured, source]) => ({ captured, source })),
    }), { flag: 'wx', mode: 0o400 });
    for (const directory of directories) fs.chmodSync(directory, directory === temporary ? 0o500 : 0o555);
    const executableCurrent = () => {
      if (executable?.kind !== 'file') return true;
      const file = environment.ESBUILD_BINARY_PATH!;
      const stat = fs.lstatSync(file, { throwIfNoEntry: false });
      return !!stat?.isFile() && (stat.mode & 0o111) === (executable.mode & 0o111)
        && fs.readFileSync(file).equals(executable.bytes);
    };
    if (!executableCurrent()) throw new Error('Captured esbuild executable differs from its input');
    const capturedRuntimeCurrent = () => !!fs.lstatSync(capturedPath(runtime.executable), { throwIfNoEntry: false })?.isFile()
      && fs.realpathSync.native(capturedPath(runtime.executable)) === capturedPath(runtime.executable)
      && readCompilerRuntimeInputs(capturedPath(runtime.executable)).hash === runtime.hash;
    if (!capturedRuntimeCurrent()) throw new Error('Captured compiler runtime differs from its input');
    return { bin: path.join(root, 'bin/apack.mjs'), executable: capturedPath(runtime.executable), runtimeDirectory: capturedPath(runtime.directory), hash, inputsFile, environment, dispose,
      isCurrent(source, options = {}) {
        return fs.realpathSync.native(source) === directory
          && executableId === JSON.stringify(executableIdentity(directory, readEsbuildOverride(options)))
          && executableCurrent() && fs.existsSync(root) && capturedRuntimeCurrent()
          && readCompilerRuntimeInputs(process.execPath).hash === runtime.hash
          && compilerPackagesHash(source) === inputs.hash && compilerPackagesHash(root) === inputs.hash;
      },
    };
  } catch (error) {
    await dispose();
    throw error;
  }
}
