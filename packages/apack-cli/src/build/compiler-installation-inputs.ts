import fs from 'node:fs';
import path from 'node:path';
import { parseCompilerPaths, relativeCompilerPath, withoutCompilerFileReads, type CompilerPathMapping } from '@apackdev/host/build/compiler-inputs';

export const COMPILER_INPUTS_ENV = 'APACK_COMPILER_INPUTS';

export interface CompilerInstallationInputs {
  readonly directory: string;
  readonly hash: string;
  readonly packages: readonly string[];
  readonly paths: readonly CompilerPathMapping[];
}

/** The private installation is owned and read-only for the worker's lifetime. */
export function readCompilerInstallationInputs(): CompilerInstallationInputs | undefined {
  const file = process.env[COMPILER_INPUTS_ENV];
  if (file === undefined) return;
  // Host bookkeeping belongs to the captured installation, not the authored read-set.
  const data = withoutCompilerFileReads(() => JSON.parse(fs.readFileSync(file, 'utf8')));
  if (!data || typeof data.hash !== 'string' || !/^[a-f0-9]{64}$/.test(data.hash)
    || !Array.isArray(data.packages) || !data.packages.every((directory: unknown) => typeof directory === 'string' && path.isAbsolute(directory) && !directory.includes('\0'))) {
    throw new Error(`Invalid captured compiler inputs: ${file}`);
  }
  return { directory: withoutCompilerFileReads(() => path.dirname(fs.realpathSync.native(file))),
    hash: data.hash, packages: data.packages, paths: parseCompilerPaths(data.paths) };
}

/** Installation and workspace namespaces belong to their compiler owners, not the source read-set. */
export function isOwnedCompilerPath(file: string, ...directories: readonly string[]): boolean {
  return directories.some(directory => {
    const relative = relativeCompilerPath(directory, file);
    return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
  });
}
