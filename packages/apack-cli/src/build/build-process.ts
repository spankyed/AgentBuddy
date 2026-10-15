import { spawn } from 'node:child_process';
import { cliBin } from '../utils.ts';
import { ensureCheckoutPackages } from './checkout-packages.ts';
import { compilationConditions } from './compilation-inputs.ts';
import { withoutSourceCondition } from '@apackdev/host/build/source-resolution';
import { BUILD_INPUTS_IPC_ENV, readBuildWatchInputs, type BuildWatchInputs } from './build-watch-inputs.ts';

/** Development builds get fresh compiler and pack module caches, including transitive imports. */
export async function runPackBuild(root: string, { args = [], onInputs, signal }: {
  args?: readonly string[];
  onInputs?: (inputs: BuildWatchInputs) => void | Promise<void>;
  signal?: AbortSignal;
} = {}): Promise<void> {
  signal?.throwIfAborted();
  // Bring linked code up to date before the child loads its CLI bundle.
  ensureCheckoutPackages(root);
  await new Promise<void>((resolve, reject) => {
    let observationError: Error | undefined;
    let observing = Promise.resolve();
    const child = spawn(process.execPath, [
      ...compilationConditions().map(condition => `--conditions=${condition}`),
      cliBin(), 'pack', 'build', ...args,
    ], {
      cwd: root, stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
      signal,
      env: { ...process.env, APACK_BUILD_WORKER: '1', [BUILD_INPUTS_IPC_ENV]: onInputs ? '1' : '0', NODE_OPTIONS: withoutSourceCondition(process.env.NODE_OPTIONS), ELECTRON_RUN_AS_NODE: '1' },
    });
    child.on('message', message => {
      const inputs = readBuildWatchInputs(message);
      if (inputs && onInputs) {
        observing = observing.then(() => onInputs(inputs)).catch(error => {
          observationError ??= error instanceof Error ? error : new Error(String(error));
        });
      }
    });
    child.once('error', reject);
    child.once('close', async (code, exitSignal) => {
      await observing;
      if (observationError) reject(observationError);
      else if (code === 0) resolve();
      else reject(new Error(`Pack build process ${exitSignal ? `terminated with ${exitSignal}` : `exited with code ${code}`}`));
    });
  });
}
