// Packs type `services` (HostServices) from @abuddy/sdk/services. A package its declarations import that a pack
// may not have installed (an optional peer) silently turns those types into `any` under skipLibCheck, so every
// package they reach must be a dependency or a required peer of @abuddy/sdk.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { builtinModules } from 'node:module';
import { describe, expect, it } from 'vitest';
import { PACKAGES_BUILT, REPO_ROOT } from '../helpers/published-packages';

const SDK = path.join(REPO_ROOT, 'packages', 'abuddy-sdk');
const packageName = (specifier: string) => specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];

/** Packages the declarations reachable from `entry` import, following relative imports */
function importedPackages(entry: string): Set<string> {
  const packages = new Set<string>();
  const seen = new Set<string>();
  const visit = (file: string) => {
    if (seen.has(file) || !fs.existsSync(file)) return;
    seen.add(file);
    // Doc comments quote example imports (`#generated/ears`); only code imports count
    const source = fs.readFileSync(file, 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const [, specifier] of source.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
      if (specifier.startsWith('.')) visit(path.resolve(path.dirname(file), specifier.replace(/\.(d\.ts|ts|js)$/, '.d.ts')));
      else if (!specifier.startsWith('node:') && !builtinModules.includes(packageName(specifier)) && packageName(specifier) !== '@abuddy/sdk') packages.add(packageName(specifier));
    }
  };
  visit(entry);
  return packages;
}

describe.skipIf(!PACKAGES_BUILT)('published @abuddy/sdk/services', () => {
  it('imports only packages every pack has installed: dependencies and required peers', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(SDK, 'package.json'), 'utf-8'));
    const optional = new Set(Object.entries(manifest.peerDependenciesMeta ?? {}).filter(([, meta]) => (meta as { optional?: boolean }).optional).map(([name]) => name));
    const installed = new Set([...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.peerDependencies ?? {}).filter((name) => !optional.has(name))]);

    const imported = importedPackages(path.join(SDK, 'dist', 'services', 'index.d.ts'));

    expect(imported).toContain('ai');
    expect([...imported].filter((name) => !installed.has(name))).toEqual([]);
  });
});
