import path from 'node:path';
import { compilerSourcePath } from './compiler-paths.ts';
import { readCompilerInstallationInputs } from './compiler-installation-inputs.ts';

/** Current compiler observations; a failed build extends subscriptions without replacing the incumbent. */
export interface BuildWatchInputs {
  readonly files: readonly string[];
  readonly directories: readonly string[];
  readonly successful: boolean;
}

const MESSAGE = 'apack:build-inputs';
export const BUILD_INPUTS_IPC_ENV = 'APACK_BUILD_INPUTS_IPC';

export async function reportBuildWatchInputs(inputs: BuildWatchInputs): Promise<void> {
  if (process.env[BUILD_INPUTS_IPC_ENV] !== '1' || !process.send || !process.connected) return;
  const mappings = readCompilerInstallationInputs()?.paths ?? [];
  await new Promise<void>(resolve => process.send!({ type: MESSAGE, ...inputs,
    files: inputs.files.map(file => compilerSourcePath(file, mappings)),
    directories: inputs.directories.map(directory => compilerSourcePath(directory, mappings)),
  }, () => resolve()));
}

export function readBuildWatchInputs(message: unknown): BuildWatchInputs | undefined {
  if (!message || typeof message !== 'object') return;
  const value = message as Record<string, unknown>;
  const paths = (input: unknown): input is string[] => Array.isArray(input)
    && input.every(file => typeof file === 'string' && path.isAbsolute(file) && !file.includes('\0'));
  if (value.type !== MESSAGE || typeof value.successful !== 'boolean' || !paths(value.files) || !paths(value.directories)) return;
  return { files: value.files, directories: value.directories, successful: value.successful };
}
