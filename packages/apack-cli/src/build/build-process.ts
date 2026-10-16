import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { COMPILER_PROCESS_GROUP_ENV, stopCompilerProcessGroup } from './compiler-process-group.ts';
import { checkoutFor, ensureCheckoutPackages } from './checkout-packages.ts';
import { captureCompilerInstallation, compilerInstallationHash, compilerPackageDirectory, COMPILER_INPUTS_ENV, type CompilerInstallation } from './compiler-installation.ts';
import { cliPackageDirectory } from './tool-identity.ts';
import { compilationConditions } from './compilation-inputs.ts';
import { withoutSourceCondition } from '@apackdev/host/build/source-resolution';
import { BUILD_INPUTS_IPC_ENV, readBuildWatchInputs, type BuildWatchInputs } from './build-watch-inputs.ts';
import { holdPackBuildLock } from './build-lock.ts';
import { readValidManifest } from '../utils.ts';
import { buildStagingDir, publishPackBuild, readPackBuildCandidate, type PackBuildCandidate } from './build-publication.ts';
import { BUILD_INPUTS_DIRECTORY_ENV, removeCompilerReadTree } from './compiler-read-tree.ts';

// Give worker SIGTERM handlers a short cleanup phase before forced termination.
const STOP_GRACE_MS = 2_000;

export interface PackBuildOptions {
  readonly args?: readonly string[];
  readonly onInputs?: (inputs: BuildWatchInputs) => void | Promise<void>;
  readonly signal?: AbortSignal;
}

export interface PackBuilder {
  build(options?: PackBuildOptions): Promise<void>;
  close(): Promise<void>;
}

/** One pack owns its compiler copy; every build gets a fresh process and live input checks. */
export function createPackBuilder(root: string): PackBuilder {
  let compiler: CompilerInstallation | undefined;
  let sourceDirectory: string | undefined;
  let active = Promise.resolve();
  let stopping: Promise<void> | undefined;
  const stopped = new AbortController();
  return {
    build({ args = [], onInputs, signal }: PackBuildOptions = {}) {
      if (stopped.signal.aborted) return Promise.reject(new Error('Pack builder is closed'));
      const options = { args: [...args], onInputs, signal: signal ? AbortSignal.any([signal, stopped.signal]) : stopped.signal };
      const result = active.then(async () => {
        options.signal.throwIfAborted();
        ensureCheckoutPackages(root);
        const cli = cliPackageDirectory();
        if (checkoutFor(cli) !== checkoutFor(root)) ensureCheckoutPackages(cli);
        const directory = compilerPackageDirectory();
        if (!compiler || sourceDirectory !== directory || compiler.hash !== compilerInstallationHash(directory)
          || compiler.hash !== compilerInstallationHash(path.dirname(path.dirname(compiler.bin)))) {
          const previous = compiler;
          compiler = await captureCompilerInstallation(directory);
          sourceDirectory = directory;
          await previous?.dispose();
        }
        options.signal.throwIfAborted();
        const lock = await holdPackBuildLock(root, {
          packId: readValidManifest(root).id, what: ['apack pack build', ...args].join(' '), signal: options.signal,
          onWait: holder => console.log(`Waiting for ${holder} to finish...`),
        });
        try {
          options.signal.throwIfAborted();
          await buildWithCompiler(root, compiler, options);
        }
        finally { lock.release(); }
      });
      active = result.catch(() => {});
      return result;
    },
    close() {
      if (!stopping) {
        stopped.abort();
        stopping = active.then(async () => { await compiler?.dispose(); compiler = undefined; });
      }
      return stopping;
    },
  };
}

export async function runPackBuild(root: string, options: PackBuildOptions = {}): Promise<void> {
  const builder = createPackBuilder(root);
  try { await builder.build(options); }
  finally { await builder.close(); }
}

async function buildWithCompiler(root: string, compiler: CompilerInstallation, { args = [], onInputs, signal }: PackBuildOptions): Promise<void> {
  const inputsDirectory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'apack-build-inputs-')));
  try {
    const candidate = await new Promise<PackBuildCandidate>((resolve, reject) => {
      let processError: Error | undefined;
      let observationError: Error | undefined;
      let candidate: PackBuildCandidate | undefined;
      let observing = Promise.resolve();
      let stopping: Promise<void> | undefined;
      let escalation: ReturnType<typeof setTimeout> | undefined;
      const grouped = process.platform !== 'win32';
      const child = spawn(process.execPath, [
        ...compilationConditions().map(condition => `--conditions=${condition}`),
        compiler.bin, 'pack', 'build', ...args,
      ], {
        cwd: root, stdio: ['ignore', 'inherit', 'inherit', 'ipc'], signal, detached: grouped,
        // Transform with this captured compiler, rather than reuse another installation's tsx cache.
        env: { ...process.env, [COMPILER_PROCESS_GROUP_ENV]: grouped ? '1' : undefined, TSX_DISABLE_CACHE: '1', APACK_BUILD_WORKER: '1', [COMPILER_INPUTS_ENV]: compiler.inputsFile,
          [BUILD_INPUTS_DIRECTORY_ENV]: inputsDirectory,
          [BUILD_INPUTS_IPC_ENV]: onInputs ? '1' : '0', NODE_OPTIONS: withoutSourceCondition(process.env.NODE_OPTIONS), ELECTRON_RUN_AS_NODE: '1' },
      });
      const stop = () => {
        if (stopping) return;
        stopping = grouped && child.pid ? stopCompilerProcessGroup(child.pid)
          : Promise.resolve().then(() => { child.kill('SIGKILL'); });
        // close awaits this result; observe rejection even if inherited pipes delay close.
        void stopping.catch(() => {});
      };
      const abort = () => { escalation = setTimeout(stop, STOP_GRACE_MS); };
      const clearStop = () => { clearTimeout(escalation); signal?.removeEventListener('abort', abort); };
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
      child.on('message', message => {
        try {
          const reported = readPackBuildCandidate(message);
          if (reported) {
            if (candidate) throw new Error('Build worker reported more than one candidate');
            candidate = reported;
          }
        } catch (error) { observationError ??= error instanceof Error ? error : new Error(String(error)); }
        const inputs = readBuildWatchInputs(message);
        if (inputs && onInputs) {
          observing = observing.then(() => onInputs(inputs)).catch(error => {
            observationError ??= error instanceof Error ? error : new Error(String(error));
          });
        }
      });
      child.once('error', error => { processError = error; });
      child.once('exit', () => { clearStop(); if (grouped) stop(); });
      child.once('close', async (code, exitSignal) => {
        clearStop();
        try { await stopping; } catch (error) { reject(error); return; }
        await observing;
        if (processError || observationError) reject(processError ?? observationError);
        else if (code === 0 && candidate) resolve(candidate);
        else if (code === 0) reject(new Error('Build worker exited without a completed candidate'));
        else reject(new Error(`Pack build process ${exitSignal ? `terminated with ${exitSignal}` : `exited with code ${code}`}`));
      });
    });
    signal?.throwIfAborted();
    publishPackBuild(root, candidate);
  } finally {
    fs.rmSync(buildStagingDir(root), { recursive: true, force: true });
    removeCompilerReadTree(inputsDirectory);
  }
}
