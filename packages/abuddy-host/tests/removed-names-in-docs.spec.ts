// Docs, CLI templates and pack sources name nothing two goals retired.
//
// The package-boundaries goal removed: the host module registry, the SDK's migrations runner, the SDK's EARS
// module (now `@abuddy/sdk/types` and `/repositories`), the engine's module-state entry points, the API's
// persistence dir, the cast repository types, the app state kept in settings, and the registries packs used
// to write to (docs/archive/goals/goal-package-boundaries.md, Phase 8).
//
// The pack-naming goal retired the words that named two things: `registry` for a file and a wire route,
// `bundle` as a noun, and `artifact` for a dependency's resolved files
// (docs/archive/goals/goal-pack-naming.md, Phase 5). A name left in a doc or a comment still compiles and
// still passes, which is why this is a guard rather than a grep run once.
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');

const REMOVED = [
  'registerHostModule', 'getHostModule', 'hostFn', 'hostValue', 'runMigrations', 'clearMemory', 'initEARSRuntime',
  'BuiltinRepositories', 'registerDesignations', 'registerSeeder', 'registerDslType',
  // The pack vocabulary's one-word-per-concept renames (docs/archive/goals/goal-pack-naming.md).
  // `registry` is the in-process collection things register into, never a file and never a wire route:
  'PackRegistryEntry', 'readPackRegistry', 'writePackRegistry', 'modifyRegistry', 'addToRegistry',
  'removeFromRegistry', 'reconcileExternalRegistry', 'registryFile', 'registeredAt', 'registryError',
  'resolveFromRegistry',
  // `bundle` is the verb for running a bundler; the thing it used to name is the pack's layout or archive:
  'BUNDLE_PATHS', 'BUNDLE_FORMAT_VERSION', 'verifyBundle', 'stageBundle', 'createBundleArchive',
  'extractBundleArchive', 'bundleArchiveName', 'readBundleInfo', 'BundleInfo', 'isBundleDir',
  'hasBuiltBundleSections', 'getPackBundleEntries', 'PackBundleEntry', 'buildPackBundle', 'packBundle',
  // `artifact` is a pack's first-class artifact, not a dependency's resolved files:
  'resolveDepArtifacts', 'DepArtifacts', 'findDepArtifacts',
  // `contributions` named two concepts at once and is retired outright: what a pack registers for the host
  // to render is an *extension*, and what a feature makes linkable from an editor is a *reference*. The bare
  // words are listed because the leftovers were prose and a manifest key, not symbols — no symbol grep
  // would have found "pack contributions barrel" or `features[].contributions`:
  'contribution', 'contributions', 'contributionTypes', 'ContributionItem', 'ContributionTypeConfig',
  'CONTRIBUTION_TYPES', 'NOTE_TYPE_TO_CONTRIBUTION_TYPE', 'PackContributions', 'PackContributionsView',
  'PackFEContributions', '_boundPackContributions', 'getPackContributions', 'mergeContributions',
  'generateContributions', 'packContributions',
].map((name) => new RegExp(`\\b${name}\\b`));
const REMOVED_PATHS = [
  /@abuddy\/sdk\/ears\b/, /ears\/internals\b/, /api\/src\/core\/persistence\b/, /\bsettings\.internal\b/,
  // The on-disk record of installed packs, the wire route, the pack's integrity file and the store's copy:
  /\bpack-registry\.json\b/, /\bpacks\.registry\b/, /\bbundle\.json\b/, /\bstore\.snapshot\b/,
];

/** Files that may name one of them, with the name and why */
const ALLOWED: Record<string, { name: RegExp; reason: string }[]> = {
  'docs/goals/goal-package-boundaries.md': [...REMOVED, ...REMOVED_PATHS].map((name) => ({ name, reason: 'the goal that removed them' })),
  // A commit message is history: the commit is named so the reader can find it, and it can't be reworded.
  'tests/e2e/CLAUDE.md': [{ name: /\bcontributions\b/, reason: 'quotes the subject of commit fix(packs), which predates the rename' }],
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
/**
 * The app's own shipping source. A retired name survives in a comment or an error string as easily as in a
 * doc — `PACK_LAYOUT.info` and `packFrontendFiles(bundleDir)` both outlived the rename that was supposed to
 * take them, with every suite green, because this guard read only docs and pack sources.
 */
const isAppSource = (file: string) =>
  /^packages\/(abuddy-(host|sdk|ears|ui|cli|testing)|api|renderer|main|preload)\/src\//.test(file)
  && /\.(ts|vue)$/.test(file);

/** The docs, CLI templates, pack sources and app sources in the repo, tracked or not (ignored files left out) */
function checkedFiles(): string[] {
  return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf-8' })
    .split('\n')
    .filter((file) => file && !/(^|\/)(node_modules|dist|__generated__)\//.test(file))
    .filter((file) => isDoc(file) || isTemplate(file) || isPackSource(file) || isAppSource(file))
    .filter((file) => fs.existsSync(path.join(ROOT, file)));
}

describe('names the package-boundaries goal removed', () => {
  it('appear in no doc, CLI template or pack source', () => {
    const files = checkedFiles();
    expect(files.filter(isDoc).length).toBeGreaterThan(50);
    expect(files.filter(isTemplate).length).toBeGreaterThan(10);
    expect(files.filter(isPackSource).length).toBeGreaterThan(500);
    expect(files.filter(isAppSource).length).toBeGreaterThan(200);
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

  it('finds the pack-naming retirements, and not the names that replaced them', () => {
    expect(removedNames('read with `readPackRegistry()` from pack-registry.json')).toEqual(['readPackRegistry', 'pack-registry.json']);
    expect(removedNames('read with `readInstalledPacks()` from installed-packs.json')).toEqual([]);
    expect(removedNames('`BUNDLE_PATHS.info` is bundle.json, verified by `verifyBundle`')).toEqual(['BUNDLE_PATHS', 'verifyBundle', 'bundle.json']);
    expect(removedNames('`PACK_LAYOUT.integrity` is integrity.json, verified by `verifyPack`')).toEqual([]);
    expect(removedNames('the route `packs.registry` serves `getPackBundleEntries()`')).toEqual(['getPackBundleEntries', 'packs.registry']);
    expect(removedNames('the route `packs.loaded` serves `getLoadedPackEntries()`')).toEqual([]);
    expect(removedNames('`resolveDepArtifacts` returns `DepArtifacts`')).toEqual(['resolveDepArtifacts', 'DepArtifacts']);
    expect(removedNames('`resolveDepFiles` returns `DepFiles`')).toEqual([]);
    // The in-process collection keeps the word (Decision 3), so these must not be caught
    expect(removedNames('createPackRegistry(), PackRegistry, PackRegistryView, stepRegistry, registerPack')).toEqual([]);
    expect(removedNames('resolveFromRemoteRegistry is the stub')).toEqual([]);
    // `contributions` is retired outright: an extension is what a pack registers, a reference is what an
    // editor links to. Prose and the manifest key are caught, which no symbol grep would have done.
    expect(removedNames('`getPackContributions()` reads `PackContributionsView`')).toEqual(['PackContributionsView', 'getPackContributions']);
    expect(removedNames('`getPackExtensions()` reads `PackExtensionsView`')).toEqual([]);
    expect(removedNames('`contributions.ts` — pack contributions barrel')).toEqual(['contributions']);
    expect(removedNames("`references.ts` — reference type barrel from each feature's references file")).toEqual([]);
    expect(removedNames('declared in `features[].contributions`')).toEqual(['contributions']);
    expect(removedNames('declared in `features[].references`')).toEqual([]);
    expect(removedNames('a `ContributionItem` from `@abuddy/sdk/fe/contributions`')).toEqual(['contributions', 'ContributionItem']);
    expect(removedNames('a `ReferenceItem` from `@abuddy/sdk/fe/references`')).toEqual([]);
    // The extensions that replaced the word, and the app extensions beside them, stay
    expect(removedNames('src/extensions/, appExtensions, getAppExtension, PackExtensions')).toEqual([]);
  });
});
