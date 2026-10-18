import fs from 'node:fs';
import path from 'node:path';
import { threadId } from 'node:worker_threads';
import { assertNativeCompilerObservations, beginCompilerStartupReads, createCompilerFileView, withoutCompilerFileReads, type CompilerInputObservations,
  type CompilerPathMapping } from '@apackdev/host/build/compiler-inputs';
import { captureCompilerLibraryEnvironment, type CompilerLibraryEnvironment } from './compiler-native-libraries.ts';
import { createCompilerNativeInputs, type CapturedNativeModule } from './compiler-native-input-owner.ts';
import { createCompilerWatchRecorder } from './build-watch-inputs.ts';

const FRONTEND = Symbol.for('apack.compiler.frontend');
export const FRONTEND_NATIVE_REPORT = /^native-inputs-\d+\.json$/;

interface NativeInputsReport {
  source: CompilerInputObservations;
  copies?: CompilerInputObservations;
  modules: CapturedNativeModule[];
}

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
export function beginFrontendNativeInputs(root: string, workspace: string, paths: readonly CompilerPathMapping[],
  nativeEnvironment = captureCompilerLibraryEnvironment()): FrontendNativeInputs {
  if (frontendNativeInputs()) throw new Error('Frontend native inputs already have an owner');
  const view = createCompilerFileView(root, { paths, observe: createCompilerWatchRecorder(workspace) });
  const sourceRoot = view.observations().root;
  const report = path.join(workspace, `native-inputs-${threadId}.json`);
  const absolute = (value: unknown): value is string => typeof value === 'string' && path.isAbsolute(value) && !value.includes('\0');
  const owned = (file: string) => {
    const relative = path.relative(workspace, file);
    return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  };
  const observations = (value: unknown): value is CompilerInputObservations => {
    if (!value || typeof value !== 'object' || !('root' in value) || !absolute(value.root) || !('entries' in value)) return false;
    return Array.isArray(value.entries) && value.entries.every(entry => Array.isArray(entry) && entry.length === 2
      && typeof entry[0] === 'string' && typeof entry[1] === 'string');
  };
  const reports = (): NativeInputsReport[] => fs.readdirSync(workspace).filter(name => FRONTEND_NATIVE_REPORT.test(name)).sort().map(name => {
    const file = path.join(workspace, name);
    try {
      const value = JSON.parse(fs.readFileSync(file, 'utf8')) as NativeInputsReport;
      if (!observations(value.source) || value.source.root !== sourceRoot
        || (value.copies !== undefined && (!observations(value.copies) || !owned(value.copies.root)))
        || !Array.isArray(value.modules) || !value.modules.every(module => module && absolute(module.source)
          && absolute(module.captured) && owned(module.captured) && absolute(module.packageRoot) && owned(module.packageRoot))
        || (value.modules.length > 0 && !value.copies)) throw new Error('Invalid native input receipt');
      return value;
    } catch (error) { throw new Error(`Cannot read frontend native inputs: ${file}`, { cause: error }); }
  });
  let previous = '';
  const save = () => withoutCompilerFileReads(() => {
    const contents = JSON.stringify({ source: view.observations(file => !native.includes(file)),
      copies: native.copies(), modules: native.modules() });
    if (contents === previous) return;
    fs.writeFileSync(report + '.tmp', contents);
    fs.renameSync(report + '.tmp', report);
    previous = contents;
  });
  const native = createCompilerNativeInputs(view, workspace, paths, nativeEnvironment, {
    capture: 'images', retainTree: true, onCapture: save,
    findModule(file) {
      for (const context of reports()) {
        const module = context.modules.find(module => module.source === file);
        if (!module) continue;
        if (context.copies) assertNativeCompilerObservations(context.copies);
        return module;
      }
    },
  });
  const stopReads = beginCompilerStartupReads({ outputDirectory: workspace, compilation: {
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
        return reports().flatMap(context => context.copies ? [context.source, context.copies] : [context.source]);
      });
    },
    async close() { inputs.disposeLocal(); },
  };
  save();
  Object.defineProperty(globalThis, FRONTEND, { value: inputs });
  return inputs;
}
