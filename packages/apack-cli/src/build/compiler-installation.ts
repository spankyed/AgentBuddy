import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { readPackageInputs } from '@apackdev/host/build/package-inputs';
import { cliPackageDirectory } from './tool-identity.ts';
import { parseCompilerPaths, type CompilerPathMapping } from './compiler-paths.ts';

export const COMPILER_INPUTS_ENV = 'APACK_COMPILER_INPUTS';

interface CompilerInstallationInputs {
  readonly hash: string;
  readonly packages: readonly string[];
  readonly paths: readonly CompilerPathMapping[];
}

/** The private installation is owned and read-only for the worker's lifetime. */
export function readCompilerInstallationInputs(): CompilerInstallationInputs | undefined {
  const file = process.env[COMPILER_INPUTS_ENV];
  if (file === undefined) return;
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!data || typeof data.hash !== 'string' || !/^[a-f0-9]{64}$/.test(data.hash)
    || !Array.isArray(data.packages) || !data.packages.every((directory: unknown) => typeof directory === 'string' && path.isAbsolute(directory) && !directory.includes('\0'))) {
    throw new Error(`Invalid captured compiler inputs: ${file}`);
  }
  return { hash: data.hash, packages: data.packages, paths: parseCompilerPaths(data.paths) };
}

export interface CompilerInstallation {
  readonly bin: string;
  readonly hash: string;
  readonly inputsFile: string;
  dispose(): Promise<void>;
}

export function compilerInstallationHash(directory: string): string {
  return readPackageInputs([{ id: 'compiler', directory, contents: true }]).hash;
}

/** A checkout builds the same distributable worker that an installed CLI runs. */
export function compilerPackageDirectory(root = cliPackageDirectory()): string {
  const directory = fs.existsSync(path.join(root, 'dist/cli.js')) ? root : path.join(root, 'dist/package');
  if (!fs.existsSync(path.join(directory, 'dist/build-worker.js'))) {
    throw new Error(`Missing pack compiler at ${directory}; build the CLI package before compiling packs`);
  }
  return fs.realpathSync(directory);
}

/** Capture before startup: normal Node loading reads private copies, never mutable compiler originals. */
export async function captureCompilerInstallation(directory = compilerPackageDirectory()): Promise<CompilerInstallation> {
  const temporary = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'apack-compiler-')));
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
    const inputs = readPackageInputs([{ id: 'compiler', directory, contents: true }], {
      onFile({ source, mode, hash }, bytes) {
        const identity = `${mode}:${hash}`;
        const previous = copied.get(source);
        if (previous !== undefined) {
          if (previous !== identity) throw new Error(`Compiler input changed during capture: ${source}`);
          return;
        }
        const target = capturedPath(source);
        mkdir(path.dirname(target));
        fs.writeFileSync(target, bytes, { flag: 'wx', mode: mode & ~0o222 });
        fs.chmodSync(target, mode & ~0o222);
        copied.set(source, identity);
      },
    });
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
    // Parent links first: a child lookup may already exist through its captured parent.
    for (const [source, target] of [...links].sort(([a], [b]) => a.length - b.length)) {
      const destination = capturedPath(source);
      const resolved = capturedPath(target);
      mkdir(path.dirname(destination));
      const existing = fs.lstatSync(destination, { throwIfNoEntry: false });
      if (existing) {
        if (existing.isSymbolicLink() && path.resolve(path.dirname(destination), fs.readlinkSync(destination)) === resolved) continue;
        if (fs.realpathSync(destination) !== fs.realpathSync(resolved)) throw new Error(`Conflicting captured compiler path: ${source}`);
      } else {
        const directoryType = process.platform === 'win32' ? 'junction' : 'dir';
        fs.symlinkSync(resolved, destination, fs.statSync(resolved, { throwIfNoEntry: false })?.isDirectory() ? directoryType : 'file');
      }
    }
    const root = capturedPath(inputs.nodes[inputs.roots[0]!.node]!.directory);
    const verified = readPackageInputs([{ id: 'compiler', directory: root, contents: true }]);
    if (verified.hash !== inputs.hash || verified.nodes.some(node => !node.directory.startsWith(`${temporary}${path.sep}`))) {
      throw new Error('Captured compiler installation differs from its inputs');
    }
    const inputsFile = path.join(temporary, 'compiler-inputs.json');
    fs.writeFileSync(inputsFile, JSON.stringify({ hash: inputs.hash,
      packages: inputs.nodes.map(node => capturedPath(node.directory)),
      paths: [...paths].map(([captured, source]) => ({ captured, source })),
    }), { flag: 'wx', mode: 0o400 });
    for (const directory of directories) fs.chmodSync(directory, directory === temporary ? 0o500 : 0o555);
    return { bin: path.join(root, 'bin/apack.mjs'), hash: inputs.hash, inputsFile, dispose };
  } catch (error) {
    await dispose();
    throw error;
  }
}
