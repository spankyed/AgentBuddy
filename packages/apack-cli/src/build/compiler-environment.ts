import { createHash } from 'node:crypto';
import path from 'node:path';
import { type CompilerPathMapping } from '@apackdev/host/build/compiler-inputs';

// These select private transport/cache locations, not authored compiler inputs.
const PRIVATE_ENVIRONMENT = new Set([
  'NODE_OPTIONS', 'TMPDIR', 'TMP', 'TEMP', 'ELECTRON_RUN_AS_NODE', 'TSX_DISABLE_CACHE',
  'APACK_BUILD_WORKER', 'APACK_FRONTEND_WORKER', 'APACK_FRONTEND_DIRECTORY',
  'APACK_COMPILER_INPUTS', 'APACK_COMPILER_NODE_OPTIONS', 'APACK_COMPILER_PROCESS_GROUP',
  'APACK_BUILD_INPUTS_DIRECTORY', 'APACK_BUILD_INPUTS_IPC', 'APACK_NO_BUILD_READS',
]);

/** Record initial environment influence without storing values or private capture locations. */
export function compilerEnvironmentIdentity(env: NodeJS.ProcessEnv = process.env, paths: readonly CompilerPathMapping[] = []): string {
  const entries = Object.entries(env).filter(([key, value]) => value !== undefined && !PRIVATE_ENVIRONMENT.has(key))
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, value]) => [key, paths.reduce((value, { captured, source }) => value === captured ? source
      : value.split(captured + path.sep).join(path.join(source, path.sep)), value!)]);
  return createHash('sha256').update(JSON.stringify(entries)).digest('hex');
}
