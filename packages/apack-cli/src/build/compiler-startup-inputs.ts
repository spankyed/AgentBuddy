import fs from 'node:fs';
import path from 'node:path';
import { createPackCompilerInputView, type PackCompilerInputView } from './compiler-input-view.ts';
import { beginCompilerStartupReads, withoutCompilerFileReads } from './compiler-file-reads.ts';
import { createCompilerReadTree, type CompilerReadTree } from './compiler-read-tree.ts';
import { compilerDiagnostic, compilerSourcePath, type CompilerPathMapping } from './compiler-paths.ts';
import type { CompilerInputObservations } from './compiler-observations.ts';

const STARTUP = Symbol.for('apack.compiler.startup');

export interface CompilerStartupInputs {
  readonly root: string;
  readonly view: PackCompilerInputView;
  stopReads(): void;
  finishLocal(): CompilerInputObservations;
  initial?: CompilerInputObservations[];
  capture(): Promise<void>;
  finish(): Promise<CompilerInputObservations[]>;
}

export function compilerStartupInputs(): CompilerStartupInputs | undefined {
  return Reflect.get(globalThis, STARTUP) as CompilerStartupInputs | undefined;
}

/** Native-only owner shared with the later compiler, including the early data-read tree's lifetime. */
export function beginCompilerStartupInputs(root: string, workspace: string, paths: readonly CompilerPathMapping[]): CompilerStartupInputs {
  if (compilerStartupInputs()) throw new Error('Compiler startup inputs already have an owner');
  const canonicalRoot = fs.realpathSync(root);
  const within = (parent: string, file: string) => {
    const relative = path.relative(parent, file);
    return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
  };
  const original = createPackCompilerInputView(root, { paths });
  let tree: CompilerReadTree | undefined;
  const sourcePath = (file: string) => tree?.sourcePath(file) ?? compilerSourcePath(file, paths);
  const includes = (file: string) => !within(workspace, file) && !paths.some(({ captured }) => within(captured, file));
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
  const view: PackCompilerInputView = { ...original, dispose() {
    withoutCompilerFileReads(() => { try { original.dispose(); } finally { tree?.dispose(); } });
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
    root: canonicalRoot, view, stopReads,
    finishLocal() {
      return withoutCompilerFileReads(() => {
        view.assertCurrent();
        return original.observations();
      });
    },
    async capture() { throw new Error('Compiler startup has no thread coordinator'); },
    async finish() { throw new Error('Compiler startup has no thread coordinator'); },
  };
  Object.defineProperty(globalThis, STARTUP, { value: startup });
  return startup;
}
