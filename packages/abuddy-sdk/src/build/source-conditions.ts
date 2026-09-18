import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';

/** The condition under which an @abuddy package's exports resolve its TypeScript source, not its dist */
const SOURCE_CONDITION = '@abuddy/source';

/**
 * The packages whose exports carry `@abuddy/source`, and which a pack can therefore resolve either
 * way: the three published ones. `@abuddy/testing` is left out on purpose — it is never published
 * with a dist, so its install says nothing about how the others were installed.
 *
 * This is the list, and `@abuddy/host/build/source-resolution` reads it from here rather than
 * keeping its own.
 *
 * @internal Host-only: abuddy CLI build tooling.
 */
export const SOURCE_PACKAGES = ['@abuddy/ears', '@abuddy/sdk', '@abuddy/ui'] as const;

/** Node's way of saying a package isn't installed here, as opposed to being installed and unreadable */
const NOT_INSTALLED = new Set(['MODULE_NOT_FOUND', 'ERR_MODULE_NOT_FOUND']);

/** The `@abuddy/source` targets an exports map names, at any nesting depth */
function sourceTargets(exportsField: unknown): string[] {
  if (typeof exportsField !== 'object' || exportsField === null) return [];
  const targets: string[] = [];
  for (const [key, value] of Object.entries(exportsField as Record<string, unknown>)) {
    if (key === SOURCE_CONDITION) {
      if (typeof value === 'string') targets.push(value);
      else targets.push(...sourceTargets(value));
    } else {
      targets.push(...sourceTargets(value));
    }
  }
  return targets;
}

interface Install {
  /** `source` when this install's own files include what its `@abuddy/source` exports point at */
  layout: 'source' | 'dist';
  /** The package's directory, for the mismatch message */
  dir: string;
}

/**
 * How one @abuddy package is installed for a pack in `dir`, or undefined when the pack can't resolve
 * it at all. The question is what the install on disk actually contains, not where it sits: a
 * published tarball ships `dist` only, so the `src/…` files its exports name under
 * `@abuddy/source` aren't there; a checkout linked in (a workspace, or `npm link`) has them.
 */
function installOf(dir: string, pkg: string): Install | undefined {
  let manifestPath: string;
  try {
    manifestPath = fs.realpathSync(createRequire(path.join(dir, 'package.json')).resolve(`${pkg}/package.json`));
  } catch (err) {
    // Only "it isn't installed here" is an answer. Anything else — an install whose manifest can't be
    // read, a directory that doesn't exist — would otherwise read as "published", which is the silent
    // wrong answer this function exists to prevent
    if (NOT_INSTALLED.has((err as NodeJS.ErrnoException).code ?? '')) return undefined;
    // No `cause`: this source is compiled by workspaces whose lib predates it
    throw new Error(`Can't tell how ${pkg} is installed for ${dir}: ${err instanceof Error ? err.message : err}`);
  }
  let manifest: { exports?: unknown };
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as { exports?: unknown };
  } catch (err) {
    throw new Error(`${manifestPath} can't be read, so how ${pkg} is installed is unknown: ${err instanceof Error ? err.message : err}`);
  }
  const packageDir = path.dirname(manifestPath);
  const hasSource = sourceTargets(manifest.exports).some((target) => fs.existsSync(path.join(packageDir, target)));
  return { layout: hasSource ? 'source' : 'dist', dir: packageDir };
}

/**
 * Says outright which way a build resolves the @abuddy packages, instead of leaving it to be read
 * off the install. Every decider honours it: this function, `scripts/with-source.mjs`, the CLI's
 * `bin/source-hooks.mjs` and `assertSourceResolution` in `@abuddy/host/build/source-resolution`.
 *
 * @internal Host-only: abuddy CLI build tooling.
 */
export const PACKAGES_MODE_ENV = 'ABUDDY_PACKAGES';

/** What `ABUDDY_PACKAGES` was set to, or undefined when nothing declared a mode */
function declaredMode(): 'source' | 'dist' | undefined {
  const declared = process.env[PACKAGES_MODE_ENV];
  if (declared === undefined || declared === '') return undefined;
  if (declared !== 'source' && declared !== 'dist') {
    throw new Error(`${PACKAGES_MODE_ENV}=${declared} is not a mode: set it to "source" (a checkout's TypeScript) or "dist" (published packages), or leave it unset to take the mode from what is installed.`);
  }
  return declared;
}

/**
 * Extra resolve conditions for building pack code in `dir`: `['@abuddy/source']` to compile the
 * @abuddy packages from a checkout's TypeScript, `[]` to resolve the `dist` a published package
 * ships.
 *
 * `ABUDDY_PACKAGES=source|dist` states the mode outright, and is how a build says what it means
 * rather than leaving it to be inferred — CI, a container, or a developer working around an install
 * this can't read. Unset, the mode is taken from what the pack has installed, which is the only
 * thing that knows: a checkout has the `src/…` files its exports name under `@abuddy/source`, a
 * tarball ships `dist` alone.
 *
 * Every caller feeds the result to a setting that is global to one compilation — tsconfig
 * `customConditions`, esbuild/Vite `conditions`, `node --conditions` — so a build can't resolve
 * @abuddy/sdk from source and @abuddy/ui from dist. When a pack's installs disagree, there is no
 * condition list that is right for both: switching the condition on breaks the published package
 * (its tarball has no `src/…` to resolve), leaving it off silently compiles the linked one's
 * stale dist. So this reports the mismatch and names the packages instead of picking one, and
 * says which declaration would settle it.
 *
 * @internal Host-only: abuddy CLI build tooling.
 */
export function sourceConditions(dir: string): string[] {
  const declared = declaredMode();
  if (declared) return declared === 'source' ? [SOURCE_CONDITION] : [];
  if (typeof dir !== 'string' || dir === '') {
    throw new Error(`sourceConditions needs the directory whose install to read, and got ${JSON.stringify(dir)}. Pass the pack's root, or declare the mode with ${PACKAGES_MODE_ENV}.`);
  }
  const installs = SOURCE_PACKAGES
    .map((pkg) => [pkg, installOf(dir, pkg)] as const)
    .filter((entry): entry is readonly [(typeof SOURCE_PACKAGES)[number], Install] => entry[1] !== undefined);

  const fromSource = installs.filter(([, install]) => install.layout === 'source');
  const fromDist = installs.filter(([, install]) => install.layout === 'dist');
  if (fromSource.length > 0 && fromDist.length > 0) {
    const list = (entries: typeof installs) => entries.map(([pkg, install]) => `${pkg} (${install.dir})`).join(', ');
    throw new Error(
      `The @abuddy packages installed for ${dir} disagree on how they resolve, and a build resolves them all the same way (${SOURCE_CONDITION} is one list of conditions per compilation, not a setting per package).\n` +
      `  from a checkout's source: ${list(fromSource)}\n` +
      `  published (dist only): ${list(fromDist)}\n` +
      `Install them the same way: link every @abuddy package to the checkout, or install every one from the registry. To build this install as it stands, say which way it resolves: ${PACKAGES_MODE_ENV}=source or ${PACKAGES_MODE_ENV}=dist.`,
    );
  }
  return fromSource.length > 0 ? [SOURCE_CONDITION] : [];
}
