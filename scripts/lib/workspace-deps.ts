/**
 * Which workspaces a package imports, read from its own `package.json`.
 *
 * One mechanism, two readers, because they are answering the same question from opposite ends. The chain
 * asks it to build a cache key: a suite compiles its `@abuddy` dependencies from source (the
 * `@abuddy/source` condition), so their source is genuinely that suite's input. `npm run spec` asks it to
 * decide what a change can reach that the *module graph* cannot see — a pack's specs import a dependency's
 * published `dist`, never its source, so no import edge runs from the source you edited to the spec that
 * covers it, and only a rebuild puts one there.
 *
 * Derived rather than listed, so a dependency added later is covered the moment it is declared.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';

/**
 * Every `packages/*` holding a package.json, derived so a new one is covered by default.
 *
 * Exported because a spec that asserts *which* packages reach a pack suite has to enumerate all of them or
 * it proves nothing: the first version of that check listed nine of the twelve by hand, looked exhaustive,
 * and missed `abuddy-host` — which reaches `@app/default-setup` transitively through `@abuddy/testing` and
 * made the count in three doc comments wrong.
 */
export const PACKAGE_DIRS = fs.readdirSync(path.join(REPO_ROOT, 'packages'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(REPO_ROOT, 'packages', entry.name, 'package.json')))
  .map((entry) => entry.name)
  .sort();

/** Every workspace package's npm name and where it lives, so a declared dependency can become a path */
const DIR_BY_PACKAGE = new Map<string, string>(PACKAGE_DIRS.map((dir) => [
  (JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'packages', dir, 'package.json'), 'utf-8')) as { name: string }).name,
  dir,
]));

/**
 * The workspaces a package imports, transitively, as directory names under `packages/`.
 *
 * `root` is a parameter rather than the module's `REPO_ROOT` because `spec-plan.ts` takes one and its whole
 * premise is that the routing is a pure function of its inputs; a helper that silently read a different root
 * than the caller was given is a trap for the first spec that points it at a fixture tree.
 *
 * **devDependencies count.** `@app/default-setup` reaches `@abuddy/testing` that way, and what imports the
 * harness is the pack's own specs, so it is genuinely an input.
 */
export function workspaceDeps(dir: string, root = REPO_ROOT, seen = new Set<string>([dir])): string[] {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'packages', dir, 'package.json'), 'utf-8')) as {
    dependencies?: Record<string, string>; devDependencies?: Record<string, string>;
  };
  const found: string[] = [];
  for (const name of Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })) {
    const child = DIR_BY_PACKAGE.get(name);
    if (!child || seen.has(child)) continue;
    seen.add(child);
    found.push(child, ...workspaceDeps(child, root, seen));
  }
  return found;
}

/** A dependency contributes its source; another package's specs are not this suite's input */
export const dependencySource = (pkg: string): string[] => [`packages/${pkg}/src`, `packages/${pkg}/package.json`];
