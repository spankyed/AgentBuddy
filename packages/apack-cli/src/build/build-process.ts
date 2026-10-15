import { spawn } from 'node:child_process';
import { cliBin } from '../utils.ts';
import { ensureCheckoutPackages } from './checkout-packages.ts';
import { compilationConditions } from './compilation-inputs.ts';
import { withoutSourceCondition } from '@apackdev/host/build/source-resolution';
import { BUILD_INPUTS_IPC_ENV, readBuildWatchInputs, type BuildWatchInputs } from './build-watch-inputs.ts';

/** A watched build gets fresh compiler and pack module caches, including transitive imports. */
export async function runPackBuild(root: string, onInputs: (inputs: BuildWatchInputs) => void | Promise<void>): Promise<void> {
  // Bring linked code up to date before the child loads its CLI bundle.
  ensureCheckoutPackages(root);
  await new Promise<void>((resolve, reject) => {
    let observationError: Error | undefined;
    let observing = Promise.resolve();
    const child = spawn(process.execPath, [
      ...compilationConditions().map(condition => `--conditions=${condition}`),
      cliBin(), 'pack', 'build',
    ], {
      cwd: root, stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
      env: { ...process.env, [BUILD_INPUTS_IPC_ENV]: '1', NODE_OPTIONS: withoutSourceCondition(process.env.NODE_OPTIONS), ELECTRON_RUN_AS_NODE: '1' },
    });
    child.on('message', message => {
      const inputs = readBuildWatchInputs(message);
      if (inputs) {
        observing = observing.then(() => onInputs(inputs)).catch(error => {
          observationError ??= error instanceof Error ? error : new Error(String(error));
        });
      }
    });
    child.once('error', reject);
    child.once('close', async (code, signal) => {
      await observing;
      if (observationError) reject(observationError);
      else if (code === 0) resolve();
      else reject(new Error(`Pack build process ${signal ? `terminated with ${signal}` : `exited with code ${code}`}`));
    });
  });
}
