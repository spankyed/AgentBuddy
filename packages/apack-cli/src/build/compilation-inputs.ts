import { createHash } from 'node:crypto';
import { errorMessage } from '@apackdev/sdk/utils/pure';
import { buildToolHash, cliPackageDirectory } from './tool-identity.ts';
import { readPackageInputs } from '@apackdev/host/build/package-inputs';
import { SOURCE_CONDITION } from '@apackdev/host/build/source-resolution';
import { readCompilerModuleInputs } from './compiler-module-inputs.ts';
import { readCompilerInstallationInputs } from './compiler-installation.ts';
import type { PackCompilerConfiguration } from './compiler-configuration.ts';
import fs from 'node:fs';
import path from 'node:path';
import { packInputFiles } from '@apackdev/host/build/pack-inputs';
import { compilerSourcePath } from './compiler-paths.ts';
import { createNativeInputReader } from './compiler-native-inputs.ts';
import { createCompilerReadTree, type CompilerReadTree } from './compiler-read-tree.ts';

/** Instrumentation flags do not change compilation. The reserved source mode is in buildToolHash. */
export function compilationConditions(args = process.execArgv, nodeOptions = process.env.NODE_OPTIONS ?? ''): string[] {
  const tokens = nodeOptions.match(/(?:[^\s"'\\]|\\.|"(?:[^"\\]|\\.)*"|'[^']*')+/g) ?? [];
  const options = [...args, ...tokens.map(token => token.replace(/["']/g, '').replace(/\\(.)/g, '$1'))];
  const conditions = new Set<string>();
  for (let i = 0; i < options.length; i++) {
    const option = options[i]!;
    let condition: string | undefined;
    if (option.startsWith('--conditions=') || option.startsWith('-C=')) condition = option.slice(option.indexOf('=') + 1);
    else if (option === '--conditions' || option === '-C') condition = options[++i];
    if (condition && condition !== SOURCE_CONDITION) conditions.add(condition);
  }
  return [...conditions].sort();
}

export interface CompilationInputs {
  readonly hash: string;
  /** Explicit pack config; absence preserves native per-file config discovery. */
  readonly configuration: PackCompilerConfiguration | undefined;
  /** Declaration programs also inherit a parent config when the pack has none. */
  readonly declarationConfiguration: PackCompilerConfiguration | undefined;
  readFile(file: string): Buffer | undefined;
  readDataPath(file: string): string;
  captureGenerated(): void;
  readTree(): CompilerReadTree;
  sourcePath(file: string): string;
  prepareNative(specifier: string, importer: string): void;
  prepareNativeSource(file: string, contents: Buffer): void;
  dispose(): void;
  assertCurrent(): void;
}

/** Own one module read-set per build; recheck its data and package/tool inputs without rerunning TypeScript. */
export function captureCompilationInputs(packRoot: string): CompilationInputs {
  const cliRoot = cliPackageDirectory();
  const compiler = readCompilerInstallationInputs();
  if (compiler && !compiler.packages.includes(cliRoot)) throw new Error('Captured compiler inputs do not belong to this CLI');
  const capturedPackages = new Set(compiler?.packages);
  const modules = readCompilerModuleInputs(packRoot);
  let tree: CompilerReadTree | undefined;
  const current = (capture = false) => {
    const owners = [{ id: 'pack', directory: packRoot, development: true }];
    if (!compiler) owners.unshift({ id: 'cli', directory: cliRoot, development: false });
    const inputs = readPackageInputs(owners, {
      discovered: modules.packageDirectories.filter(directory => !capturedPackages.has(directory)),
      onFile: capture ? (file, bytes) => modules.captureFile(file.source, bytes) : undefined,
    });
    const hash = createHash('sha256').update(compiler?.hash ?? buildToolHash()).update(inputs.hash).update(modules.hash)
      .update(JSON.stringify([process.versions.node, process.platform, process.arch, compilationConditions()]))
      .digest('hex');
    return { hash, packages: inputs };
  };
  const { hash, packages } = current(true);
  const sourcePath = (file: string): string => tree?.sourcePath(file) ?? compilerSourcePath(file, compiler?.paths ?? []);
  const readTree = (): CompilerReadTree => {
    if (!tree) {
      const links = packages.nodes.flatMap(node => [
        ...node.links.map(link => ({ file: path.join(node.directory, link.path), target: link.target })),
        ...Object.entries(node.dependencies).flatMap(([name, index]) => index === null ? []
          : [{ file: node.lookups[name]!, target: packages.nodes[index]!.directory }]),
      ]);
      for (const link of links) {
        modules.captureLocation(link.file, 'file');
        modules.ancestors(link.file);
      }
      const snapshot = modules.snapshot();
      const locations = [...snapshot.locations, ...packages.nodes.flatMap(node => node.directories
        .map(directory => ({ file: directory.source, physical: directory.source, kind: 'directory' })))];
      tree = createCompilerReadTree({ ...snapshot, locations, links }, compiler?.paths ?? [], (file, bytes, readPath) => native.projectMetadata(file, bytes, readPath));
    }
    return tree;
  };
  const native = createNativeInputReader(modules, packages, sourcePath, snapshot => readTree().include(snapshot));
  return {
    hash,
    configuration: modules.configuration,
    declarationConfiguration: modules.declarationConfiguration,
    readFile(file) {
      const bytes = modules.readBytes(file);
      if (tree && bytes !== undefined) tree.include({
        files: [modules.captureFile(file, bytes)], locations: [modules.captureLocation(file, 'file')!], links: [],
      });
      return bytes;
    },
    readDataPath(file) {
      file = path.resolve(file);
      // The parent already owns and verifies these tool bytes. Do not redirect them to the checkout.
      if (compiler?.paths.some(({ captured }) => {
        const relative = path.relative(captured, file);
        return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
      })) return file;
      file = sourcePath(file);
      const bytes = modules.readBytes(file);
      const location = modules.captureLocation(file, 'file');
      const owned = readTree();
      owned.includeData({ files: bytes === undefined ? [] : [modules.captureFile(file, bytes)],
        locations: [...(location ? [location] : []), ...modules.ancestors(file)], links: [] });
      return owned.dataPath(file);
    },
    captureGenerated() {
      for (const relative of packInputFiles(packRoot, { generated: true })) {
        if (!relative.startsWith('src/__generated__/')) continue;
        const file = path.join(packRoot, relative);
        modules.captureFile(file, fs.readFileSync(file));
      }
    },
    readTree,
    sourcePath,
    prepareNative(specifier, importer) { readTree(); native.prepare(specifier, sourcePath(importer)); },
    prepareNativeSource(file, contents) { native.prepareSource(sourcePath(file), contents); },
    dispose() { tree?.dispose(); tree = undefined; },
    assertCurrent() {
      try {
        tree?.assertCurrent();
        modules.assertCurrent();
        if (current().hash !== hash) throw new Error('Implementation, package or execution options differ');
      } catch (cause) {
        throw new Error(`Compiler or installed package inputs changed; retry before publishing: ${errorMessage(cause)}`, { cause });
      }
    },
  };
}
