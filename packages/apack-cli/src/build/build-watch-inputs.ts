import fs from 'node:fs';
import path from 'node:path';
import { threadId } from 'node:worker_threads';
import { compilerSourcePath, withoutCompilerFileReads } from '@apackdev/host/build/compiler-inputs';
import type { BuildInputKind, BuildInputObserver } from '@apackdev/host/build/pack-inputs';
import { readCompilerInstallationInputs } from './compiler-installation-inputs.ts';

/** Current compiler observations; a failed build extends subscriptions without replacing the incumbent. */
export interface BuildWatchInputs {
  readonly files: readonly string[];
  readonly directories: readonly string[];
  readonly successful: boolean;
  /** Native reads use nonrecursive namespace probes, not frontend content-directory trees. */
  readonly probes?: ReadonlyArray<readonly [file: string, kind: BuildInputKind]>;
}

const MESSAGE = 'apack:build-inputs';
export const BUILD_INPUTS_IPC_ENV = 'APACK_BUILD_INPUTS_IPC';

/** Retain probes before a native read can fail; abrupt thread exit must not lose repair subscriptions. */
export function createCompilerWatchRecorder(directory: string): BuildInputObserver | undefined {
  if (process.env[BUILD_INPUTS_IPC_ENV] !== '1') return;
  const file = path.join(directory, `watch-${threadId}.jsonl`);
  withoutCompilerFileReads(() => fs.writeFileSync(file, ''));
  const probes = new Map<string, BuildInputKind>();
  const priority = { directory: 0, file: 1, entries: 2 };
  return (input, kind) => {
    const previous = probes.get(input);
    if (previous && priority[previous] >= priority[kind]) return;
    probes.set(input, kind);
    withoutCompilerFileReads(() => {
      fs.appendFileSync(file, JSON.stringify([input, kind]) + '\n');
    });
  };
}

/** Live readers ignore incomplete rows; final readers run after every compiler thread has stopped. */
export function readCompilerWatchReports(directory: string): BuildWatchInputs[] {
  return fs.readdirSync(directory).filter(name => /^watch-\d+\.jsonl$/.test(name)).map(name => {
    const contents = fs.readFileSync(path.join(directory, name), 'utf8');
    // Only newline-committed hints survive an abrupt thread termination.
    const end = contents.lastIndexOf('\n');
    const complete = end < 0 ? '' : contents.slice(0, end);
    const probes = complete ? complete.split('\n').map(line => JSON.parse(line)) : [];
    const inputs = readBuildWatchInputs({ type: MESSAGE, files: [], directories: [], probes, successful: false });
    if (!inputs) throw new Error(`Invalid compiler watch report: ${name}`);
    return inputs;
  });
}

export async function reportBuildWatchInputs(inputs: BuildWatchInputs): Promise<void> {
  if (process.env[BUILD_INPUTS_IPC_ENV] !== '1' || !process.send || !process.connected) return;
  const mappings = readCompilerInstallationInputs()?.paths ?? [];
  await new Promise<void>(resolve => process.send!({ type: MESSAGE, ...inputs,
    files: inputs.files.map(file => compilerSourcePath(file, mappings)),
    directories: inputs.directories.map(directory => compilerSourcePath(directory, mappings)),
    ...(inputs.probes && { probes: inputs.probes.map(([file, kind]) => [compilerSourcePath(file, mappings), kind]) }),
  }, () => resolve()));
}

export function readBuildWatchInputs(message: unknown): BuildWatchInputs | undefined {
  if (!message || typeof message !== 'object') return;
  const value = message as Record<string, unknown>;
  const paths = (input: unknown): input is string[] => Array.isArray(input)
    && input.every(file => typeof file === 'string' && path.isAbsolute(file) && !file.includes('\0'));
  if (value.type !== MESSAGE || typeof value.successful !== 'boolean' || !paths(value.files) || !paths(value.directories)) return;
  const kinds = new Set(['file', 'directory', 'entries']);
  if (value.probes !== undefined && (!Array.isArray(value.probes) || !value.probes.every(probe =>
    Array.isArray(probe) && probe.length === 2 && paths([probe[0]]) && kinds.has(probe[1])))) return;
  return { files: value.files, directories: value.directories, successful: value.successful,
    ...(value.probes !== undefined ? { probes: value.probes as [string, BuildInputKind][] } : {}) };
}
