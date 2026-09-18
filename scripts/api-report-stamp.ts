// A fast staleness gate for the committed API reports (etc/*.api.md, etc/*.component.md).
//
// `api:check` is the authority, but it runs API Extractor over every entry: 46s for the three
// packages, 33s of it @abuddy/ui. That is too slow to sit in `npm run typecheck`, so before this
// existed the reports were guarded only by CI — and a public export could change without its report
// and nothing said so until CI ran.
//
// This is the cheap half. The reports are a pure function of the declarations API Extractor reads,
// so if those declarations have not changed, neither have the reports. Comparing them is a hash of
// ~230 files: milliseconds, against 46 seconds.
//
// WHAT IS HASHED, AND WHY IT IS `dist` AND NOT THE SOURCE
//
// API Extractor reads `.temp/api-types`, which `api:build` deletes and re-emits on every run, so it
// cannot be compared without paying the compile. `dist` holds the same declarations, persistently,
// and `packages:ensure` — already the first step of `npm run typecheck` — has rebuilt it by the time
// this runs. Hashing `src` instead would be wrong in the expensive direction: every edit to a
// function body would demand an `api:update` that changed nothing.
//
// Only `.ts` files under `dist` are hashed. That is the whole of it: `dist` holds `.d.ts` and, for
// @abuddy/ui's components, `.d.vue.ts` (the name TypeScript looks for under node16). `.js` is
// deliberately excluded — it changes when a function body changes, which is exactly the false alarm
// this is built to avoid. `.map` files are excluded too: they embed absolute paths.
//
// Two properties were measured on this repo before this was written, because the gate is worthless
// without them:
//
//   - emit is deterministic: rebuilding a package with no source change gives the same fingerprint
//   - a body-only edit (a local added inside `randomId`) leaves the fingerprint byte-identical
//
// A package's own declarations are not enough: its reports name types from its @abuddy dependencies,
// which is why `tsconfig.api-extractor.json` resolves those to their built declarations. So a
// dependency's `dist` is hashed too, transitively. A change to @abuddy/ears therefore asks for an
// `api:update` of the SDK and UI as well. That is eager but not wrong — an ears type does surface in
// their reports — and ears changes are rare.
//
// THE STAMP IS COMMITTED, next to the reports it describes. A stamp under node_modules/.cache would
// be absent on a fresh clone, and the gate would have to either fail (blocking a checkout that is
// perfectly fine) or pass (leaving it blind until someone happened to run api:update once). Committed,
// it is right immediately after a clone, and a review sees "the declarations changed" beside the
// report diff. This is sound only because emit is reproducible, which is the first property above; if
// it ever stops being, the failure is a spurious "run api:update", never a missed change.
//
//   tsx scripts/api-report-stamp.ts packages/abuddy-sdk [--write]
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fingerprintInputs } from '@abuddy/host/build/packages-built';

/** The file recording the fingerprint the committed reports were generated from */
export const stampFile = (pkgDir: string): string => path.join(pkgDir, 'etc', 'declarations.sha256');

/**
 * `@abuddy/x` → its workspace directory, as a sibling of the package that depends on it. Resolved
 * from the dependent rather than from this file's own location, so the rule holds wherever the
 * packages sit and a spec can point it at a fixture tree.
 */
function packageDir(name: string, fromPkgDir: string): string | undefined {
  const dir = path.resolve(fromPkgDir, '..', name.replace('@abuddy/', 'abuddy-'));
  return fs.existsSync(path.join(dir, 'package.json')) ? dir : undefined;
}

/** This package and every @abuddy package it depends on, transitively, nearest first */
export function declarationPackages(pkgDir: string, seen = new Set<string>()): string[] {
  const resolved = path.resolve(pkgDir);
  if (seen.has(resolved)) return [];
  seen.add(resolved);
  const pkg = JSON.parse(fs.readFileSync(path.join(resolved, 'package.json'), 'utf-8')) as {
    dependencies?: Record<string, string>; peerDependencies?: Record<string, string>;
  };
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies }).filter((name) => name.startsWith('@abuddy/'));
  return [resolved, ...deps.flatMap((name) => {
    const dir = packageDir(name, resolved);
    return dir ? declarationPackages(dir, seen) : [];
  })];
}

/** Every declaration file under a package's dist: `.d.ts`, and `.d.vue.ts` for UI components */
function declarationFiles(dir: string, out: string[] = []): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) declarationFiles(full, out);
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

/** The declarations this package's reports are generated from, its dependencies' included */
export function declarationInputs(pkgDir: string): string[] {
  return declarationPackages(pkgDir).flatMap((dir) => declarationFiles(path.join(dir, 'dist')));
}

export function declarationFingerprint(pkgDir: string): string {
  return fingerprintInputs(declarationInputs(pkgDir));
}

/** Why the reports may be out of date, or null. Never throws. */
export function staleReason(pkgDir: string): string | null {
  const inputs = declarationInputs(pkgDir);
  if (inputs.length === 0) {
    return 'its declarations are not built (no dist); run npm run packages:build';
  }
  let recorded: string | undefined;
  try {
    recorded = fs.readFileSync(stampFile(pkgDir), 'utf-8').trim();
  } catch { /* missing or unreadable: the same as never stamped */ }
  if (!recorded) return `no ${path.basename(stampFile(pkgDir))}; run npm run api:update`;
  return recorded === declarationFingerprint(pkgDir) ? null : 'its declarations changed since the reports were generated; run npm run api:update';
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const pkgDir = path.resolve(process.argv[2] ?? '');
  const name = (JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf-8')) as { name: string }).name;
  if (process.argv.includes('--write')) {
    fs.mkdirSync(path.dirname(stampFile(pkgDir)), { recursive: true });
    fs.writeFileSync(stampFile(pkgDir), `${declarationFingerprint(pkgDir)}\n`);
    console.log(`${name}: recorded the declarations its API reports came from`);
  } else {
    const reason = staleReason(pkgDir);
    if (reason) {
      console.error(`${name}: ${reason}`);
      process.exit(1);
    }
    console.log(`${name}: API reports match its declarations`);
  }
}
