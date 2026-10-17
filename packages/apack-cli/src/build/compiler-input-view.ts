import path from 'node:path';
import { packInputFiles, type BuildInputObserver } from '@apackdev/host/build/pack-inputs';
import { createCompilerFileView } from './compiler-file-view.ts';
import { compilerSourcePath, type CompilerPathMapping } from './compiler-paths.ts';
import { readPackageInputs, readPackageDirectoryEntries } from '@apackdev/host/build/package-inputs';
import { createCompilerInputObservations, hashCompilerInputObservations } from './compiler-observations.ts';

/** Native startup and compilation share authored/dependency bytes and their namespace history. */
export function createPackCompilerInputView(root: string, options: {
  paths?: readonly CompilerPathMapping[];
  observe?: BuildInputObserver;
} = {}) {
  const authoredFiles = Object.freeze(packInputFiles(root));
  const view = createCompilerFileView(root, { ...options, authoredFiles });
  try {
    for (const relative of authoredFiles) {
      const file = path.join(root, relative);
      if (view.readBytes(file) === undefined) throw new Error(`Compiler source could not be captured: ${file}`);
    }
    const observationRoot = view.observations().root;
    const packageEntries = new Map<string, readonly string[]>();
    const packageObservations = createCompilerInputObservations(observationRoot);
    readPackageInputs([{ id: 'pack', directory: root, development: true }], {
      observe: (file, kind) => { view.captureDataLocation(file, kind); },
      onFile: (file, bytes) => { view.captureFile(file.source, bytes); },
      onDirectory(directory, names) {
        packageEntries.set(directory, Object.freeze([...names]));
        const source = compilerSourcePath(directory, options.paths ?? []);
        packageObservations.record(['package-entries', path.relative(observationRoot, source).split(path.sep).join('/')], names);
      },
    });
    const assertCurrent = () => {
      view.assertCurrent();
      for (const [directory, names] of packageEntries) {
        if (JSON.stringify(readPackageDirectoryEntries(directory).map(entry => entry.name)) !== JSON.stringify(names)) {
          throw new Error(`Declared npm package membership changed: ${directory}`);
        }
      }
      if (JSON.stringify(packInputFiles(root)) !== JSON.stringify(authoredFiles)) {
        throw new Error('Compiler source membership changed during discovery');
      }
    };
    assertCurrent();
    const observations = () => {
      const observed = view.observations();
      return createCompilerInputObservations(observed.root, [observed, packageObservations.snapshot()]).snapshot();
    };
    return { ...view, authoredFiles, assertCurrent, observations, hash: () => hashCompilerInputObservations(observations()) };
  } catch (error) { view.dispose(); throw error; }
}

export type PackCompilerInputView = ReturnType<typeof createPackCompilerInputView>;
