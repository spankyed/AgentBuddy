/**
 * Where a pack's own compiler resolves the `@abuddy` packages: their published `dist`, or a checkout's source.
 *
 * A pack compiles against `dist` — the one layout a pack author ever has — and both of its bundlers do so
 * unconditionally: `bundlePackSource` hands esbuild the pack's tsconfig, and esbuild reads `baseUrl`, `paths` and
 * `experimentalDecorators` from one but has no notion of `customConditions` at all (measured: the string does not
 * appear in its binary); the FE bundler names Vite's default client conditions outright. `tsc` is the odd one out,
 * because it *does* honour `customConditions`. So a pack linked to a checkout that enables `@abuddy/source`
 * typechecks green against workspace source while shipping bundles built from `dist`: the typecheck proved
 * nothing, and the author finds out after publishing.
 *
 * **It resolves rather than reading config.** The repo's own `findMissingSourceConditions` reads configs, and has
 * to: it asks a different question — whether a *config* declares the condition, which covers a pack's vitest or
 * Vite config, where no module resolution happens under `tsc` at all. This one asks what the compiler actually
 * does, which catches every route to source (an `extends` chain, a `paths` entry, a project reference), needs no
 * config text parsed, and can name the file it landed on.
 *
 * `assertSourceResolution` (`@abuddy/host/build/source-resolution`) is the same question with the opposite
 * expectation, asked of a host process. It lives in `@abuddy/host` and this does not, because this needs
 * `typescript`, which `@abuddy/host` deliberately does not declare — `packages/api` imports host, and the
 * compiler has no business in the backend's tree.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SOURCE_PACKAGES } from '@abuddy/host/build/source-resolution';
import ts from 'typescript';

/** One package a pack's compiler resolves to source, and the file it landed on */
export interface SourceResolution {
  readonly specifier: string;
  /** Relative to the pack, `/`-separated: what the report prints */
  readonly resolved: string;
}

/** The package a file belongs to: the nearest directory at or above it holding a `package.json` */
function packageRootOf(file: string): string | undefined {
  let dir = path.dirname(file);
  for (;;) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return undefined;
    dir = up;
  }
}

/**
 * Every `@abuddy` package this pack's `tsconfig.json` resolves to source instead of `dist`.
 *
 * Empty for a pack with no tsconfig, one whose config cannot be read, and — the ordinary case — one that
 * resolves `dist`. A package the pack does not depend on does not resolve at all and is skipped, rather than
 * being reported as something worse than it is.
 */
export function packResolvesSource(packDir: string): SourceResolution[] {
  const configFile = path.join(packDir, 'tsconfig.json');
  if (!fs.existsSync(configFile)) return [];
  const host: ts.ParseConfigFileHost = { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} };
  const parsed = ts.getParsedCommandLineOfConfigFile(configFile, {}, host);
  if (!parsed) return [];
  // Any path under the pack's `src`: a bare specifier resolves from the containing file's directory outwards, and
  // the file itself is never read, so it need not exist
  const from = path.join(packDir, 'src', 'index.ts');
  // TypeScript hands back a real path, so the report is relative to the pack's: on macOS a temp directory is
  // reached through /var and realpaths to /private/var, and the difference climbed out of the pack entirely
  const base = fs.realpathSync(packDir);
  return SOURCE_PACKAGES.flatMap((specifier) => {
    const resolved = ts.resolveModuleName(specifier, from, parsed.options, ts.sys).resolvedModule?.resolvedFileName;
    if (resolved === undefined) return [];
    const root = packageRootOf(resolved);
    if (root === undefined || !resolved.startsWith(path.join(root, 'src') + path.sep)) return [];
    return [{ specifier, resolved: path.relative(base, resolved).split(path.sep).join('/') }];
  });
}
