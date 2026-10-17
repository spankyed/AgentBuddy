import { createCompilerFileView, withoutCompilerFileReads, type CompilerInputObservations,
  type CompilerPathMapping } from '@apackdev/host/build/compiler-inputs';
import { captureMachOLibraryEnvironment, type MachOLibraryEnvironment } from './compiler-native-libraries.ts';
import { createCompilerNativeInputs } from './compiler-native-input-owner.ts';
import { createCompilerWatchRecorder } from './build-watch-inputs.ts';

const FRONTEND = Symbol.for('apack.compiler.frontend');

export interface FrontendNativeInputs {
  readonly nativeEnvironment: MachOLibraryEnvironment;
  finishLocal(): CompilerInputObservations;
  disposeLocal(): void;
  snapshot(): Promise<CompilerInputObservations[]>;
  close(): Promise<void>;
}

export function frontendNativeInputs(): FrontendNativeInputs | undefined {
  return Reflect.get(globalThis, FRONTEND) as FrontendNativeInputs | undefined;
}

/** Native admission stays installed for Vite's lifetime; ordinary authored reads remain live. */
export function beginFrontendNativeInputs(root: string, workspace: string, paths: readonly CompilerPathMapping[],
  nativeEnvironment = captureMachOLibraryEnvironment()): FrontendNativeInputs {
  if (frontendNativeInputs()) throw new Error('Frontend native inputs already have an owner');
  const view = createCompilerFileView(root, { paths, observe: createCompilerWatchRecorder(workspace) });
  const native = createCompilerNativeInputs(view, workspace, paths, nativeEnvironment, 'images');
  const inputs: FrontendNativeInputs = {
    nativeEnvironment, disposeLocal: native.dispose,
    finishLocal() {
      return withoutCompilerFileReads(() => {
        native.assertCurrent();
        return view.observations(file => !native.includes(file));
      });
    },
    async snapshot() { return [inputs.finishLocal()]; },
    async close() { inputs.disposeLocal(); },
  };
  Object.defineProperty(globalThis, FRONTEND, { value: inputs });
  return inputs;
}
