import path from 'node:path';
import { readPackBuildInputs, assertPackBuildInputsCurrent } from '@apackdev/host/build/pack-build-inputs';

/** Test the recorded compiler context; the Playwright runner's environment did not produce this build. */
export function assertPrebuiltPackCurrent(root: string, release: boolean): void {
  try {
    const inputs = readPackBuildInputs(path.join(root, 'dist'));
    if (release && !inputs.options.includes('--release')) {
      throw new Error('The test invocation requires a --release build');
    }
    assertPackBuildInputsCurrent(root, inputs);
  } catch (cause) {
    throw new Error(`Cannot test the prebuilt pack at ${root}: ${cause instanceof Error ? cause.message : String(cause)}. `
      + `Run apack pack build${release ? ' --release' : ''} or drop --prebuilt.`, { cause });
  }
}
