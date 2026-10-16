import fs from 'node:fs';
import path from 'node:path';
import { isPackInputPath, packInputFiles, type BuildInputObserver } from '@apackdev/host/build/pack-inputs';
import { createCompilerFileView } from './compiler-file-view.ts';
import type { CompilerPathMapping } from './compiler-paths.ts';

/** Native startup and the compiler share one authored-input boundary and owned read history. */
export function createPackCompilerInputView(root: string, options: {
  paths?: readonly CompilerPathMapping[];
  observe?: BuildInputObserver;
} = {}) {
  const authoredRoots = [...new Set([path.resolve(root), fs.realpathSync(root)])];
  const view = createCompilerFileView(root, {
    ...options,
    // Generated imports are outputs of discovery, not inputs to its next invocation.
    excluded: file => authoredRoots.some(directory => {
      const relative = path.relative(directory, file);
      return !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
        && !isPackInputPath(relative, false) && !relative.split(path.sep).includes('node_modules');
    }),
  });
  try {
    const authoredFiles = Object.freeze(packInputFiles(root));
    for (const relative of authoredFiles) {
      const file = path.join(root, relative);
      if (view.readBytes(file) === undefined) throw new Error(`Compiler source could not be captured: ${file}`);
    }
    const assertCurrent = () => {
      view.assertCurrent();
      if (JSON.stringify(packInputFiles(root)) !== JSON.stringify(authoredFiles)) {
        throw new Error('Compiler source membership changed during discovery');
      }
    };
    assertCurrent();
    return { ...view, authoredFiles, assertCurrent };
  } catch (error) { view.dispose(); throw error; }
}

export type PackCompilerInputView = ReturnType<typeof createPackCompilerInputView>;
