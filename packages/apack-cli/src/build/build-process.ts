import { spawn } from 'node:child_process';
import { cliBin } from '../utils.ts';
import { ensureCheckoutPackages } from './checkout-packages.ts';
import { compilationConditions } from './compilation-inputs.ts';
import { withoutSourceCondition } from '@apackdev/host/build/source-resolution';

/** A watched build gets fresh compiler and pack module caches, including transitive imports. */
export async function runPackBuild(root: string): Promise<void> {
  // Bring linked code up to date before the child loads its CLI bundle.
  ensureCheckoutPackages(root);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [
      ...compilationConditions().map(condition => `--conditions=${condition}`),
      cliBin(), 'pack', 'build',
    ], {
      cwd: root, stdio: ['ignore', 'inherit', 'inherit'],
      env: { ...process.env, NODE_OPTIONS: withoutSourceCondition(process.env.NODE_OPTIONS), ELECTRON_RUN_AS_NODE: '1' },
    });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`Pack build process ${signal ? `terminated with ${signal}` : `exited with code ${code}`}`));
    });
  });
}
