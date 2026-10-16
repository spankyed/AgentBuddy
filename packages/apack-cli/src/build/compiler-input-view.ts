import fs from 'node:fs';
import path from 'node:path';
import { isPackInputPath, type BuildInputObserver } from '@apackdev/host/build/pack-inputs';
import { createCompilerFileView } from './compiler-file-view.ts';
import type { CompilerPathMapping } from './compiler-paths.ts';

/** Native startup and the compiler share one authored-input boundary and owned read history. */
export function createPackCompilerInputView(root: string, options: {
  paths?: readonly CompilerPathMapping[];
  observe?: BuildInputObserver;
} = {}) {
  const authoredRoots = [...new Set([path.resolve(root), fs.realpathSync(root)])];
  return createCompilerFileView(root, {
    ...options,
    // Generated imports are outputs of discovery, not inputs to its next invocation.
    excluded: file => authoredRoots.some(directory => {
      const relative = path.relative(directory, file);
      return !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
        && !isPackInputPath(relative, false) && !relative.split(path.sep).includes('node_modules');
    }),
  });
}

export type PackCompilerInputView = ReturnType<typeof createPackCompilerInputView>;
