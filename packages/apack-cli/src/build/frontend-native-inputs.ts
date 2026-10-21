import { beginCompilerStartupReads, createCompilerFileView, withoutCompilerFileReads, type CompilerInputObservations } from '@apackdev/host/build/compiler-inputs';
import { captureCompilerLibraryEnvironment, type CompilerLibraryEnvironment } from './compiler-native-libraries.ts';
import { createCompilerNativeInputs } from './compiler-native-input-owner.ts';
import { createCompilerWatchRecorder } from './build-watch-inputs.ts';
import { compilerNativeStore } from './compiler-native-store.ts';
import { createCompilerNativeReports } from './compiler-native-reports.ts';
import type { CompilerInstallationInputs } from './compiler-installation-inputs.ts';

const FRONTEND = Symbol.for('apack.compiler.frontend');
export interface FrontendNativeInputs {
  readonly nativeEnvironment: CompilerLibraryEnvironment;
  finishLocal(): CompilerInputObservations;
  stopReads(): void;
  disposeLocal(): void;
  snapshot(): Promise<CompilerInputObservations[]>;
  close(): Promise<void>;
}

export function frontendNativeInputs(): FrontendNativeInputs | undefined {
  return Reflect.get(globalThis, FRONTEND) as FrontendNativeInputs | undefined;
}

/** Native admission precedes execution; receipts and copies live with the whole frontend process. */
export function beginFrontendNativeInputs(root: string, workspace: string, compiler: Pick<CompilerInstallationInputs, 'directory' | 'paths'>,
  nativeEnvironment = captureCompilerLibraryEnvironment(), asyncLoader?: string): FrontendNativeInputs {
  if (frontendNativeInputs()) throw new Error('Frontend native inputs already have an owner');
  const { paths } = compiler;
  const view = createCompilerFileView(root, { paths, observe: createCompilerWatchRecorder(workspace) });
  const reports = createCompilerNativeReports(view.observations().root, workspace, compilerNativeStore(compiler.directory));
  const save = () => withoutCompilerFileReads(() => {
    reports.write({ source: view.observations(file => !native.includes(file)),
      copies: native.copies(), modules: native.modules() });
  });
  const native = createCompilerNativeInputs(view, workspace, compiler, nativeEnvironment, {
    capture: 'images', onCapture: save,
    findModule: file => reports.findModule(file),
  });
  const stopReads = beginCompilerStartupReads({ outputDirectory: workspace, asyncLoader, compilation: {
    isInput: native.includes, readDataPath: native.readDataPath, sourcePath: native.sourcePath,
    diagnostic: native.diagnostic,
    readMetadata: (kind, file, args) => view.readMetadata(kind, native.sourcePath(file), args),
    readDirectory: (file, options) => view.readDirectoryData(native.sourcePath(file), options),
    openDirectory: (file, options) => view.openDirectoryData(native.sourcePath(file), options),
    requireParent: file => file,
  } });
  const inputs: FrontendNativeInputs = {
    nativeEnvironment,
    stopReads() { stopReads(); save(); },
    disposeLocal() { stopReads(); native.dispose(); },
    finishLocal() {
      return withoutCompilerFileReads(() => {
        save();
        native.assertCurrent();
        return view.observations(file => !native.includes(file));
      });
    },
    async snapshot() {
      return withoutCompilerFileReads(() => {
        save();
        native.assertCurrent();
        return reports.read().flatMap(context => context.copies ? [context.source, context.copies] : [context.source]);
      });
    },
    async close() { inputs.disposeLocal(); },
  };
  save();
  Object.defineProperty(globalThis, FRONTEND, { value: inputs });
  return inputs;
}
