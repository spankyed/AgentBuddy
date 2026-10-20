import path from 'node:path';
import fs from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { stagedFileHashes, verifyPack, type PackIntegrity } from '@apackdev/host/packs';
import { readPackBuildInputs, assertPackBuildInputsCurrent } from '@apackdev/host/build/pack-build-inputs';

/** Test the recorded compiler context; the Playwright runner's environment did not produce this build. */
export function assertPrebuiltPackCurrent(root: string, release: boolean) {
  try {
    const dist = path.join(root, 'dist');
    const integrity = verifyPack(dist);
    const inputs = readPackBuildInputs(dist, integrity);
    if (release && !inputs.options.includes('--release')) {
      throw new Error('The test invocation requires a --release build');
    }
    assertPackBuildInputsCurrent(root, inputs);
    return { inputs, integrity };
  } catch (cause) {
    throw new Error(`Cannot test the prebuilt pack at ${root}: ${cause instanceof Error ? cause.message : String(cause)}. `
      + `Run apack pack build${release ? ' --release' : ''} before testing again.`, { cause });
  }
}

/** Compare an archive at installation acceptance, using staging's existing published-file projection. */
export function packArchiveAcceptance(root: string, release: boolean) {
  // An explicitly selected published archive can also be tested without a local source build.
  if (!fs.existsSync(path.join(root, 'dist'))) {
    if (release) throw new Error('Testing PACK_ARCHIVE with --release requires a local --release build for comparison.');
    return undefined;
  }
  const { inputs, integrity } = assertPrebuiltPackCurrent(root, release);
  const files = stagedFileHashes(integrity);
  return (candidate: { integrity: PackIntegrity }): undefined => {
    assertPackBuildInputsCurrent(root, inputs);
    if (!isDeepStrictEqual(candidate.integrity.files, files)) {
      throw new Error('PACK_ARCHIVE does not match the selected build. Archive it again or unset PACK_ARCHIVE.');
    }
    return undefined;
  };
}
