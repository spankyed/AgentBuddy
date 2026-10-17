import fs from 'node:fs';
import path from 'node:path';
import {
  createPackCompilerInputView,
  type PackCompilerInputView,
  beginCompilerStartupReads,
  beginCompilerNativeModules,
  withoutCompilerFileReads,
  compilerDiagnostic,
  compilerSourcePath,
  type CompilerPathMapping,
  type CompilerInputObservations,
} from '@apackdev/host/build/compiler-inputs';
import { captureCompilerPackage } from './compiler-package-inputs.ts';
import { assertCapturedMachOLibraries, captureMachOLibraryEnvironment, type MachOLibraryEnvironment } from './compiler-native-libraries.ts';
import { createCompilerReadTree, type CompilerReadTree } from './compiler-read-tree.ts';

import { parseNodeOptions } from '@apackdev/host/build/source-resolution';
import { compilerEnvironmentIdentity } from './compiler-environment.ts';
import { createCompilerWatchRecorder } from './build-watch-inputs.ts';

const STARTUP = Symbol.for('apack.compiler.startup');

export interface CompilerStartupInputs {
  readonly root: string;
  readonly executionIdentity: string;
  readonly view: PackCompilerInputView;
  readonly nativeEnvironment: MachOLibraryEnvironment;
  stopReads(): void;
  nativeModule(file: string): string;
  finishLocal(): CompilerInputObservations;
  initial?: CompilerInputObservations[];
  capture(): Promise<void>;
  finish(): Promise<CompilerInputObservations[]>;
}

/** Capture launch state before user initialization can rewrite the ambient process values. */
export function compilerExecutionIdentity(nodeOptions = process.env.NODE_OPTIONS, paths: readonly CompilerPathMapping[] = []): string {
  return JSON.stringify([Object.entries(process.versions).sort(), process.platform, process.arch,
    process.execArgv, parseNodeOptions(nodeOptions), compilerEnvironmentIdentity(process.env, paths)]);
}

export function compilerStartupInputs(): CompilerStartupInputs | undefined {
  return Reflect.get(globalThis, STARTUP) as CompilerStartupInputs | undefined;
}

/** Native-only owner shared with the later compiler, including the early data-read tree's lifetime. */
export function beginCompilerStartupInputs(root: string, workspace: string, paths: readonly CompilerPathMapping[], nodeOptions = process.env.NODE_OPTIONS,
  nativeEnvironment = captureMachOLibraryEnvironment()): CompilerStartupInputs {
  if (compilerStartupInputs()) throw new Error('Compiler startup inputs already have an owner');
  const canonicalRoot = fs.realpathSync(root);
  const executionIdentity = compilerExecutionIdentity(nodeOptions, paths);
  const within = (parent: string, file: string) => {
    const relative = path.relative(parent, file);
    return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
  };
  const includes = (file: string) => !within(workspace, file) && !paths.some(({ captured }) => within(captured, file));
  const recordWatchInput = createCompilerWatchRecorder(workspace);
  const known = new Set<string>();
  let initializing = true;
  const original = createPackCompilerInputView(root, { paths, observe: recordWatchInput && ((file, kind) => {
    const key = `${kind}\0${file}`;
    if (known.has(key)) return;
    known.add(key);
    if (initializing || !includes(file)) return;
    const relative = path.relative(canonicalRoot, file);
    if (within(canonicalRoot, file) && !relative.split(path.sep).includes('node_modules')) return;
    recordWatchInput(compilerSourcePath(file, paths), kind);
  }) });
  initializing = false;
  let tree: CompilerReadTree | undefined;
  const sourcePath = (file: string) => tree?.sourcePath(file) ?? compilerSourcePath(file, paths);
  const readDataPath = (file: string) => withoutCompilerFileReads(() => {
    if (!includes(file)) return file;
    file = sourcePath(file);
    const bytes = original.readDataBytes(file);
    const location = original.captureLocation(file, 'file');
    tree ??= createCompilerReadTree({ files: [], locations: [], links: [] }, paths);
    tree.includeData({ files: bytes === undefined ? [] : [original.captureFile(file, bytes)],
      locations: [...(location ? [location] : []), ...original.ancestors(file)], links: [] });
    return tree.dataPath(file);
  });
  const nativePackages = new Set<string>();
  const packageRoot = (file: string, exists: (file: string) => boolean) => {
    for (let directory = path.dirname(file); ; directory = path.dirname(directory)) {
      if (exists(path.join(directory, 'package.json'))) return directory;
      if (path.dirname(directory) === directory) return path.dirname(file);
    }
  };
  const nativeModule = (file: string): string => {
    if (process.platform !== 'darwin') return file;
    // Compiler-installation and earlier read-tree copies already have an input owner. Inspect their
    // actual images without recording ephemeral private paths as new source inputs.
    if (!includes(file) || sourcePath(file) !== file) {
      assertCapturedMachOLibraries(file, packageRoot(file, fs.existsSync), {
        arch: process.arch, environment: nativeEnvironment,
        realpath: file => fs.realpathSync(file),
        read: file => includes(file) && sourcePath(file) === file ? original.readDataBytes(file)
          : fs.statSync(file, { throwIfNoEntry: false })?.isFile() ? fs.readFileSync(file) : undefined,
      });
      return file;
    }
    const owner = packageRoot(file, original.fileSystem.fileExists);
    if (!nativePackages.has(owner)) {
      const { snapshot } = captureCompilerPackage(owner, original.captureDataLocation, (file, bytes) =>
        original.captureFile(file.source, original.readDataBytes(file.source) ?? bytes));
      tree ??= createCompilerReadTree({ files: [], locations: [], links: [] }, paths);
      tree.includeData(snapshot);
      nativePackages.add(owner);
    }
    assertCapturedMachOLibraries(file, owner, {
      arch: process.arch, environment: nativeEnvironment, read: original.readDataBytes, realpath: original.fileSystem.realpath,
    });
    return readDataPath(file);
  };
  const stopNativeModules = beginCompilerNativeModules(nativeModule);
  const view: PackCompilerInputView = { ...original, dispose() {
    withoutCompilerFileReads(() => {
      stopNativeModules();
      try { original.dispose(); } finally { tree?.dispose(); }
    });
  }, assertCurrent() {
    withoutCompilerFileReads(() => { original.assertCurrent(); tree?.assertCurrent(); });
  } };
  const stopReads = beginCompilerStartupReads({ outputDirectory: workspace, compilation: {
    isInput: includes,
    readDataPath, sourcePath,
    diagnostic: message => compilerDiagnostic(tree?.diagnostic(message) ?? message, paths),
    readMetadata: (kind, file, args) => original.readMetadata(kind, sourcePath(file), args),
    readDirectory: (file, options) => original.readDirectoryData(sourcePath(file), options),
    openDirectory: (file, options) => original.openDirectoryData(sourcePath(file), options),
    // Native preloads retain their source resolution context. Compiler module projection takes over later.
    requireParent: file => file,
  } });
  const startup: CompilerStartupInputs = {
    root: canonicalRoot, executionIdentity, view, nativeEnvironment, stopReads, nativeModule,
    finishLocal() {
      return withoutCompilerFileReads(() => {
        view.assertCurrent();
        return original.observations(file => !includes(file));
      });
    },
    async capture() { throw new Error('Compiler startup has no thread coordinator'); },
    async finish() { throw new Error('Compiler startup has no thread coordinator'); },
  };
  Object.defineProperty(globalThis, STARTUP, { value: startup });
  return startup;
}
