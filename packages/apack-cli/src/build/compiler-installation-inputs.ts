import fs from 'node:fs';
import path from 'node:path';
import { parseCompilerPaths, type CompilerPathMapping } from '@apackdev/host/build/compiler-inputs';

export const COMPILER_INPUTS_ENV = 'APACK_COMPILER_INPUTS';

interface CompilerInstallationInputs {
  readonly hash: string;
  readonly packages: readonly string[];
  readonly paths: readonly CompilerPathMapping[];
}

/** The private installation is owned and read-only for the worker's lifetime. */
export function readCompilerInstallationInputs(): CompilerInstallationInputs | undefined {
  const file = process.env[COMPILER_INPUTS_ENV];
  if (file === undefined) return;
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!data || typeof data.hash !== 'string' || !/^[a-f0-9]{64}$/.test(data.hash)
    || !Array.isArray(data.packages) || !data.packages.every((directory: unknown) => typeof directory === 'string' && path.isAbsolute(directory) && !directory.includes('\0'))) {
    throw new Error(`Invalid captured compiler inputs: ${file}`);
  }
  return { hash: data.hash, packages: data.packages, paths: parseCompilerPaths(data.paths) };
}
