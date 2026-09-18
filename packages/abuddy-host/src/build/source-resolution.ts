import * as fs from 'node:fs';
import * as path from 'node:path';

import { PACKAGES_MODE_ENV, SOURCE_PACKAGES } from '@abuddy/sdk/build/source-conditions';

const SOURCE_CONDITION_FLAG = '--conditions=@abuddy/source';

/** NODE_OPTIONS with the source condition appended once (scripts/with-source.mjs does the same) */
export function withSourceCondition(nodeOptions: string | undefined): string {
  const options = (nodeOptions ?? '').split(/\s+/).filter(Boolean);
  return (options.includes(SOURCE_CONDITION_FLAG) ? options : [...options, SOURCE_CONDITION_FLAG]).join(' ');
}

/** NODE_OPTIONS without the source condition, for processes that choose their own conditions */
export function withoutSourceCondition(nodeOptions: string | undefined): string {
  return (nodeOptions ?? '').split(/\s+/).filter((option) => option && option !== SOURCE_CONDITION_FLAG).join(' ');
}

/** Resolves a specifier the way the checked process does, to a file path */
export type ResolveFile = (specifier: string) => string;

function tryResolve(resolve: ResolveFile, specifier: string): string | undefined {
  try {
    return fs.realpathSync(resolve(specifier));
  } catch {
    return undefined;
  }
}

/**
 * Throws when a checkout's workspace @abuddy/ears, @abuddy/sdk or @abuddy/ui doesn't resolve to its source.
 * Without the @abuddy/source condition a process would run the checkout's dist, which is stale
 * or missing. Installed packages (they ship no src) and packages that don't resolve pass.
 *
 * @param resolve resolves like the process being checked (its conditions and loader hooks)
 * @param processName names the process in the error
 */
export function assertSourceResolution(resolve: ResolveFile, processName: string): void {
  // A build that declared it resolves the published packages means it: this checks the other case
  if (process.env[PACKAGES_MODE_ENV] === 'dist') return;
  for (const name of SOURCE_PACKAGES) {
    const manifestPath = tryResolve(resolve, `${name}/package.json`);
    if (!manifestPath) continue;
    const dir = path.dirname(manifestPath);
    const srcDir = path.join(dir, 'src');
    if (!fs.existsSync(srcDir)) continue;

    const exports: Record<string, unknown> = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')).exports ?? {};
    const subpath = Object.keys(exports).find((key) => {
      const target = exports[key];
      return typeof target === 'object' && target !== null && '@abuddy/source' in target;
    });
    if (!subpath) continue;
    const specifier = `${name}${subpath.slice(1)}`;
    const resolved = tryResolve(resolve, specifier);
    if (resolved?.startsWith(srcDir + path.sep)) continue;

    const target = resolved ? path.relative(dir, resolved) : 'its unbuilt dist';
    throw new Error(
      `${processName} resolves ${specifier} to ${target} instead of the checkout's source (${path.relative(process.cwd(), srcDir) || srcDir}). ` +
      'Run it with the @abuddy/source condition: `node scripts/with-source.mjs <command>` or `node --conditions=@abuddy/source`.',
    );
  }
}
