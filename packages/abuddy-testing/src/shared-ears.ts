// A pack's code and its @abuddy/sdk must load the same @abuddy/ears: the SDK's test runtime installs the engine
// into its own copy, so a pack whose @abuddy/ears is another copy (versions that don't match, nested by npm)
// finds no engine installed.
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';

interface ResolvedPackage {
  file: string;
  version: string;
}

function resolvePackage(fromFile: string, name: string): ResolvedPackage | undefined {
  try {
    const file = fs.realpathSync(createRequire(fromFile).resolve(`${name}/package.json`));
    return { file, version: (JSON.parse(fs.readFileSync(file, 'utf-8')) as { version?: string }).version ?? 'unknown' };
  } catch {
    return undefined;
  }
}

/** Throws when the pack in `packDir` and its @abuddy/sdk resolve different copies of @abuddy/ears */
export function assertSharedEars(packDir: string): void {
  const fromPack = path.join(packDir, 'package.json');
  const sdk = resolvePackage(fromPack, '@abuddy/sdk');
  if (!sdk) return;
  const packEars = resolvePackage(fromPack, '@abuddy/ears');
  if (!packEars) {
    throw new Error(`@abuddy/ears isn't installed in ${packDir}: add it to the pack's dependencies, at the version @abuddy/sdk ${sdk.version} uses`);
  }
  const sdkEars = resolvePackage(sdk.file, '@abuddy/ears');
  if (sdkEars && sdkEars.file !== packEars.file) {
    throw new Error(
      `The pack's @abuddy/ears ${packEars.version} and @abuddy/sdk's @abuddy/ears ${sdkEars.version} are different copies `
      + `(${path.dirname(packEars.file)}, ${path.dirname(sdkEars.file)}): install matching versions of @abuddy/sdk and @abuddy/ears`,
    );
  }
}
