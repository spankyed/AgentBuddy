// Docs, CLI templates and pack sources name nothing the package-boundaries goal removed: the host module registry,
// the SDK's migrations runner, the SDK's EARS module (now `@abuddy/sdk/types` and `/repositories`), the engine's module-state entry points, the API's persistence dir, the cast repository
// types, the app state kept in settings, and the registries packs used to write to (docs/goals/goal-package-boundaries.md, Phase 8)
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');

const REMOVED = [
  'registerHostModule', 'getHostModule', 'hostFn', 'hostValue', 'runMigrations', 'clearMemory', 'initEARSRuntime',
  'BuiltinRepositories', 'registerDesignations', 'registerSeeder', 'registerDslType',
].map((name) => new RegExp(`\\b${name}\\b`));
const REMOVED_PATHS = [/@abuddy\/sdk\/ears\b/, /ears\/internals\b/, /api\/src\/core\/persistence\b/, /\bsettings\.internal\b/];

/** Files that may name one of them, with the name and why */
const ALLOWED: Record<string, { name: RegExp; reason: string }[]> = {
  'docs/goals/goal-package-boundaries.md': [...REMOVED, ...REMOVED_PATHS].map((name) => ({ name, reason: 'the goal that removed them' })),
};

/** Every removed name `text` mentions */
export function removedNames(text: string, allowed: RegExp[] = []): string[] {
  return [...REMOVED, ...REMOVED_PATHS]
    .filter((pattern) => !allowed.some((a) => a.source === pattern.source))
    .flatMap((pattern) => text.match(pattern)?.[0] ?? []);
}

const isDoc = (file: string) => file.endsWith('.md') && !file.startsWith('docs/archive/') && path.basename(file) !== 'CHANGELOG.md';
const isTemplate = (file: string) => file.startsWith('packages/abuddy-cli/src/commands/');
const isPackSource = (file: string) => file.startsWith('packages/default-setup/src/') || /^tests\/fixtures\/[^/]+\/src\//.test(file);

/** The docs, CLI templates and pack sources in the repo, tracked or not (ignored files left out) */
function checkedFiles(): string[] {
  return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf-8' })
    .split('\n')
    .filter((file) => file && !/(^|\/)(node_modules|dist|__generated__)\//.test(file))
    .filter((file) => isDoc(file) || isTemplate(file) || isPackSource(file))
    .filter((file) => fs.existsSync(path.join(ROOT, file)));
}

describe('names the package-boundaries goal removed', () => {
  it('appear in no doc, CLI template or pack source', () => {
    const files = checkedFiles();
    expect(files.filter(isDoc).length).toBeGreaterThan(50);
    expect(files.filter(isTemplate).length).toBeGreaterThan(10);
    expect(files.filter(isPackSource).length).toBeGreaterThan(500);
    const found = files.flatMap((file) => {
      const allowed = (ALLOWED[file] ?? []).map(({ name }) => name);
      return removedNames(fs.readFileSync(path.join(ROOT, file), 'utf-8'), allowed).map((name) => `${file}: ${name}`);
    });
    expect(found, 'describe the code as it is: the root CLAUDE.md ("SDK packages") lists what replaced each').toEqual([]);
  });

  it('finds each of them, and not the names that replaced them', () => {
    expect(removedNames('bound with `registerHostModule(key, value)`')).toEqual(['registerHostModule']);
    expect(removedNames('import { tx } from "@abuddy/ears/internals"')).toEqual(['ears/internals']);
    expect(removedNames('import { flowRepository } from "@abuddy/sdk/ears"')).toEqual(['@abuddy/sdk/ears']);
    expect(removedNames('import { flowRepository } from "@abuddy/sdk/repositories"; import { tx } from "@abuddy/ears"')).toEqual([]);
    expect(removedNames('stored in `settings.internal.version`')).toEqual(['settings.internal']);
    expect(removedNames('see packages/api/src/core/persistence/lmdb')).toEqual(['api/src/core/persistence']);
    expect(removedNames('generated seeders call registerSeeder()')).toEqual(['registerSeeder']);
    expect(removedNames('runAppMigrations(registry), getRegisteredSeeders(), clearMemoryCache')).toEqual([]);
    expect(removedNames('runMigrations()', [/\brunMigrations\b/])).toEqual([]);
  });
});
