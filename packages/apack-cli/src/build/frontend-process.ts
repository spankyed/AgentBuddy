import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compilationConditions } from './compilation-inputs.ts';
import { withoutSourceCondition } from '@apackdev/host/build/source-resolution';
import { COMPILER_INPUTS_ENV } from './compiler-installation-inputs.ts';
import { COMPILER_PROCESS_GROUP_ENV, stopCompilerProcessGroup } from './compiler-process-group.ts';
import type { CompilerInstallation } from './compiler-installation.ts';
import { assertCompilerLibraryInsertion } from './compiler-native-libraries.ts';

export interface PackFrontendAddress { readonly port: number; readonly pid: number }

export interface PackFrontend {
  readonly address: PackFrontendAddress;
  alive(): boolean;
  close(): Promise<void>;
}

/** A generation's Vite modules are private; authored sources stay live for HMR. */
export async function startPackFrontend(root: string, compiler: CompilerInstallation, signal: AbortSignal): Promise<PackFrontend> {
  signal.throwIfAborted();
  assertCompilerLibraryInsertion();
  const grouped = process.platform !== 'win32';
  const directory = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'apack-vite-')));
  const child = spawn(compiler.executable, [...compilationConditions().map(value => `--conditions=${value}`), compiler.bin], {
    cwd: root, detached: grouped, stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    env: { ...process.env, ...compiler.environment, APACK_FRONTEND_WORKER: '1', APACK_BUILD_WORKER: undefined,
      [COMPILER_INPUTS_ENV]: compiler.inputsFile, [COMPILER_PROCESS_GROUP_ENV]: grouped ? '1' : undefined,
      APACK_FRONTEND_DIRECTORY: directory,
      NODE_OPTIONS: withoutSourceCondition(process.env.NODE_OPTIONS), ELECTRON_RUN_AS_NODE: '1', TSX_DISABLE_CACHE: '1' },
  });
  let failure: Error | undefined;
  const closed = new Promise<void>(resolve => {
    child.once('error', error => { failure = error; });
    child.once('close', () => resolve());
  });
  let closing: Promise<void> | undefined;
  const close = () => closing ??= (async () => {
    const timer = setTimeout(() => child.kill('SIGKILL'), 2_000);
    try {
      if (child.connected) child.send('frontend-close', () => {});
      else child.kill('SIGKILL');
      await closed;
      if (grouped && child.pid) await stopCompilerProcessGroup(child.pid);
      await fs.promises.rm(directory, { recursive: true, force: true });
    } finally { clearTimeout(timer); }
  })();
  const abort = () => { void close().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    const port = await new Promise<number>((resolve, reject) => {
      child.on('message', message => {
        if (!message || typeof message !== 'object' || !('type' in message) || message.type !== 'frontend-ready') return;
        if (!('hash' in message) || message.hash !== compiler.hash || !('port' in message)
          || typeof message.port !== 'number' || !Number.isInteger(message.port) || message.port < 1 || message.port > 65535) {
          reject(new Error('Invalid pack frontend readiness')); return;
        }
        resolve(message.port);
      });
      void closed.then(() => reject(failure ?? new Error(`Pack frontend exited before readiness (${child.exitCode ?? child.signalCode})`)));
    });
    signal.throwIfAborted();
    return { address: { port, pid: child.pid! }, alive: () => child.exitCode === null && child.signalCode === null, close };
  } catch (error) {
    await close();
    signal.throwIfAborted();
    throw error;
  } finally { signal.removeEventListener('abort', abort); }
}
