// A pack's code and its @apackdev/sdk must load the same @apackdev/ears: the SDK's test runtime installs the engine
// into its own copy, so a pack whose @apackdev/ears is another copy (versions that don't match, nested by npm)
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

/** Throws when the pack in `packDir` and its @apackdev/sdk resolve different copies of @apackdev/ears */
export function assertSharedEars(packDir: string): void {
  const fromPack = path.join(packDir, 'package.json');
  const sdk = resolvePackage(fromPack, '@apackdev/sdk');
  if (!sdk) return;
  const packEars = resolvePackage(fromPack, '@apackdev/ears');
  if (!packEars) {
    throw new Error(`@apackdev/ears isn't installed in ${packDir}: add it to the pack's dependencies, at the version @apackdev/sdk ${sdk.version} uses`);
  }
  const sdkEars = resolvePackage(sdk.file, '@apackdev/ears');
  if (sdkEars && sdkEars.file !== packEars.file) {
    throw new Error(
      `The pack's @apackdev/ears ${packEars.version} and @apackdev/sdk's @apackdev/ears ${sdkEars.version} are different copies `
      + `(${path.dirname(packEars.file)}, ${path.dirname(sdkEars.file)}): install matching versions of @apackdev/sdk and @apackdev/ears`,
    );
  }
}
