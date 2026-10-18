import fs from 'node:fs';
import path from 'node:path';
import {
  createPackCompilerInputView,
  type PackCompilerInputView,
  beginCompilerStartupReads,
  withoutCompilerFileReads,
  compilerSourcePath,
  relativeCompilerPath,
  type CompilerPathMapping,
  type CompilerInputObservations,
} from '@apackdev/host/build/compiler-inputs';
import { captureCompilerLibraryEnvironment, type CompilerLibraryEnvironment } from './compiler-native-libraries.ts';
import { createCompilerNativeInputs } from './compiler-native-input-owner.ts';
import { createCompilerNativeReports } from './compiler-native-reports.ts';

import { parseNodeOptions } from '@apackdev/host/build/source-resolution';
import { compilerEnvironmentIdentity, compilerLibraryEnvironmentIdentity } from './compiler-environment.ts';
import { createCompilerWatchRecorder } from './build-watch-inputs.ts';
import { isOwnedCompilerPath, type CompilerInstallationInputs } from './compiler-installation-inputs.ts';

const STARTUP = Symbol.for('apack.compiler.startup');

export interface CompilerStartupInputs {
  readonly root: string;
  readonly executionIdentity: string;
  readonly view: PackCompilerInputView;
  readonly nativeEnvironment: CompilerLibraryEnvironment;
  stopReads(): void;
  disposeLocal(): void;
  nativeModule(file: string): string;
  finishLocal(): CompilerInputObservations;
  initial?: CompilerInputObservations[];
  capture(): Promise<void>;
  finish(): Promise<CompilerInputObservations[]>;
}

/** Capture launch state before user initialization can rewrite the ambient process values. */
export function compilerExecutionIdentity(nativeEnvironment: CompilerLibraryEnvironment, nodeOptions = process.env.NODE_OPTIONS, paths: readonly CompilerPathMapping[] = []): string {
  return JSON.stringify([Object.entries(process.versions).sort(), process.platform, process.arch,
    process.execArgv, parseNodeOptions(nodeOptions), compilerEnvironmentIdentity(process.env, paths),
    compilerLibraryEnvironmentIdentity(nativeEnvironment, paths)]);
}

export function compilerStartupInputs(): CompilerStartupInputs | undefined {
  return Reflect.get(globalThis, STARTUP) as CompilerStartupInputs | undefined;
}

/** Native-only owner shared with the later compiler, including the early data-read tree's lifetime. */
export function beginCompilerStartupInputs(root: string, workspace: string, compiler: Pick<CompilerInstallationInputs, 'directory' | 'paths'>, nodeOptions = process.env.NODE_OPTIONS,
  nativeEnvironment = captureCompilerLibraryEnvironment(), asyncLoader?: string): CompilerStartupInputs {
  if (compilerStartupInputs()) throw new Error('Compiler startup inputs already have an owner');
  const { paths } = compiler;
  const canonicalRoot = fs.realpathSync.native(root);
  const executionIdentity = compilerExecutionIdentity(nativeEnvironment, nodeOptions, paths);
  const within = (parent: string, file: string) => {
    const relative = relativeCompilerPath(parent, file);
    return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
  };
  const includes = (file: string) => !isOwnedCompilerPath(file, workspace, compiler.directory);
  const recordWatchInput = createCompilerWatchRecorder(workspace);
  const known = new Set<string>();
  let initializing = true;
  const original = createPackCompilerInputView(root, { paths, observe: recordWatchInput && ((file, kind) => {
    const key = `${kind}\0${file}`;
    if (known.has(key)) return;
    known.add(key);
    if (initializing || !includes(file)) return;
    const relative = relativeCompilerPath(canonicalRoot, file);
    if (within(canonicalRoot, file) && !relative.split(path.sep).includes('node_modules')) return;
    recordWatchInput(compilerSourcePath(file, paths), kind);
  }) });
  initializing = false;
  const reports = createCompilerNativeReports(original.observations().root, workspace);
  const save = () => withoutCompilerFileReads(() => reports.write({
    source: original.observations(file => !native.includes(file)), copies: native.copies(), modules: native.modules(),
  }));
  const native = createCompilerNativeInputs(original, workspace, compiler, nativeEnvironment, {
    capture: 'package', onCapture: save, findModule: file => reports.findModule(file),
  });
  save();
  const { sourcePath, readDataPath, nativeModule } = native;
  const view: PackCompilerInputView = { ...original, dispose: native.dispose, assertCurrent: native.assertCurrent };
  const stopReads = beginCompilerStartupReads({ outputDirectory: workspace, asyncLoader, compilation: {
    isInput: includes,
    readDataPath, sourcePath,
    diagnostic: native.diagnostic,
    readMetadata: (kind, file, args) => original.readMetadata(kind, sourcePath(file), args),
    readDirectory: (file, options) => original.readDirectoryData(sourcePath(file), options),
    openDirectory: (file, options) => original.openDirectoryData(sourcePath(file), options),
    // Native preloads retain their source resolution context. Compiler module projection takes over later.
    requireParent: file => file,
  } });
  const startup: CompilerStartupInputs = {
    root: canonicalRoot, executionIdentity, view, nativeEnvironment, stopReads, nativeModule,
    disposeLocal() { stopReads(); view.dispose(); },
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
