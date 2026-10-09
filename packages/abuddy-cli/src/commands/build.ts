import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  compilePack,
  buildPackConfigFromManifest,
  PACK_TYPES_DEF,
  PACK_SNAPSHOT_FORMAT,
  entitiesWithoutShapes,
  SEED_COMPILERS_FILE,
  _buildProvenance,
  type CompilePackOptions, type PackConfig, type PackSnapshot, type PackTypeManifest, type ContentDependency,
} from '@abuddy/sdk/build';
import { findFEEntry, bundlePackFE } from '../build/fe-bundler';
import { abuddyScope, dslInputsHash, feInputsHash, typesInputsHash, filesUnder, readStamps, reuseProblem, takeForward, writeStamps, type PhaseStamp } from '../build/phase-cache';
import { ensureCheckoutPackages } from '../build/checkout-packages.ts';
import { refusePackRuleViolations } from '../build/pack-rules.ts';
import { bundlePackRuntime, bundlePackSeedCompilers, bundlePackSeedRuntime, bundlePackStepBuild, SEED_RUNTIME_FILE } from '../build/be-bundler';
import { buildReads } from '../build/build-reads';
import { bundleDslDefs } from '../build/dsl-defs';
import { bundlePackTypes } from '../build/types-bundler';
import { facadeProblems } from '../build/facade-gate';
import { compareFacadeReport, facadeReportFile, facadeReportText } from '../build/facade-report';
import { bundlePackFlowHelpers } from '../build/flow-helpers-bundler';
import { PACK_LAYOUT, createPackRegistry } from '@abuddy/host/packs';
import { replaceDir } from '@abuddy/host/replace-dir';
import { holdPackBuildLock } from '../build/build-lock.ts';
import { checkFeatureSettings } from '@abuddy/sdk/framework';
import { resolveDeps } from './generate';
import { resolveDepFiles } from './fetch-deps';
import { generateEntries, warnStaleDepTypes } from './generate-entries';
import { findPackRoot, readValidManifest, sdkVersion } from '../utils';

/** Loads a pack's content compiler module, which may be TypeScript */
async function importPackModule(file: string): Promise<Record<string, unknown>> {
  const { tsImport } = await import('tsx/esm/api');
  return tsImport(file, import.meta.url) as Promise<Record<string, unknown>>;
}

/**
 * Problems with the pack's feature settings files. The app registers each feature's settings as
 * defaults when the pack loads, and refuses settings that set anything but the feature's own plugin's.
 */
export async function featureSettingsProblems(root: string, features: ReadonlyArray<{ id: string; settings?: string }>): Promise<string[]> {
  const problems: string[] = [];
  for (const feature of features) {
    if (!feature.settings) continue;
    const file = path.resolve(root, feature.settings);
    if (!fs.existsSync(file)) {
      problems.push(`Feature "${feature.id}" settings: ${feature.settings} doesn't exist`);
      continue;
    }
    problems.push(...checkFeatureSettings(feature.id, (await importPackModule(file)).default));
  }
  return problems;
}

/**
 * Where a build writes before it is a build: the whole of `dist/` is assembled here and renamed into place at
 * the end, so `dist` holds the previous build whole or this one whole and never neither.
 *
 * **What that replaced is removing `dist` first**, which every reader of a pack's output reads as *not built* —
 * so a build published ~20s in which that was the answer, and the fixture-pack race in `1e19b40d9` was it. The
 * tree still goes whole, which is what stops `abuddy pack` and the test fixtures shipping a dropped output: it
 * goes whole by being a different tree, rather than by being deleted.
 *
 * Inside the pack, so the rename cannot cross a filesystem, and under `.abuddy/` because every pack already
 * ignores that directory — a staging tree `git` reports is a directory that appears and vanishes inside the
 * population this repo's own checks derive from.
 */
export function buildStagingDir(root: string): string {
  return path.join(root, '.abuddy', 'build');
}

/**
 * `abuddy build` as the user runs it. A pack compiles against the @abuddy packages' dist, and when that
 * dist belongs to a checkout it is built on demand, so the command brings it up to date first — as
 * `abuddy test` and `abuddy run` do (the doors are listed in packages/abuddy-testing/CLAUDE.md).
 *
 * It sits here rather than in `build()` because `abuddy run` calls that on every file change, and the
 * check reads every source of all five packages: once per command is right, once per keystroke is not.
 *
 * `npm start` depends on this one. The root `prebuild:be:dev` builds the pack the app ships with `abuddy
 * build --skip-fe` and declares no `packages:ensure` of its own, because this is it. Putting the check back
 * on that script is the fix if this ever stops ensuring.
 */
export async function buildCommand(args: string[]): Promise<void> {
  const root = findPackRoot(process.cwd());
  ensureCheckoutPackages(root);
  if (args.includes('--watch')) {
    const { watchPackRuntime } = await import('../build/watch.ts');
    // `npm start` forks this and boots the API against the runtime it writes, so it waits to be told the
    // first bundle landed. `process.send` is absent for anyone who ran the command themselves
    await watchPackRuntime(root, readValidManifest(root).id, { onFirstBuild: () => process.send?.({ type: 'ready' }) });
    return;
  }
  await build(args);
}

export async function build(args: string[]) {
  const root = findPackRoot(process.cwd());
  const staged = buildStagingDir(root);
  // One build of this pack at a time: two share the staging directory above and each clears it first, so the
  // second would wipe the first's half-written tree and both would rename something over `dist`. A build
  // already running is waited for rather than refused — see `build/build-lock.ts`
  const lock = await holdPackBuildLock(root, {
    packId: readValidManifest(root).id,
    what: ['abuddy build', ...args].join(' '),
    onWait: (holder) => console.log(`Waiting for ${holder} to finish...`),
  });
  try {
    await buildIntoStaging(args);
  } catch (err) {
    // Whatever failed and wherever, the pack is left with the build it had. Out here rather than beside each
    // `throw` because a phase that fails before the gates are even reached — an invalid manifest, a feature's
    // missing settings file — is the half that would be forgotten
    fs.rmSync(staged, { recursive: true, force: true });
    throw err;
  } finally {
    lock.release();
  }
}

async function buildIntoStaging(args: string[]) {
  const root = findPackRoot(process.cwd());
  // The installer rejects an invalid manifest; don't build (or let CI publish) one
  const manifest = readValidManifest(root);

  // What each bundling phase read, for the chain step that builds this pack to be checked against. The
  // phases with no bundler to ask — codegen, the content compilation, feature settings, the pack rules — are
  // absent from the record rather than guessed at
  const reads = buildReads(root);
  // What the last build left reusable, and what this one leaves for the next
  const stamps = readStamps(root);
  const nextStamps: Record<string, PhaseStamp> = {};

  // `outputDir` is where every phase below writes; `distDir` is what it becomes, once they have all succeeded
  const distDir = path.join(root, 'dist');
  const outputDir = buildStagingDir(root);
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });

  if (!args.includes('--skip-generate')) {
    const { depTypes, depSnapshots } = await resolveDeps(root, manifest.dependencies);
    await generateEntries([], undefined, depTypes, depSnapshots);
  }

  const settingsProblems = await featureSettingsProblems(root, manifest.features ?? []);
  if (settingsProblems.length > 0) {
    throw new Error(`Invalid feature settings:\n${settingsProblems.map(p => `  - ${p}`).join('\n')}`);
  }

  // Every rule a pack is held to, reported together: an author fixes them in one pass rather than one build
  // each, and the switchable ones say how to allow them (`build/pack-rules.ts`)
  refusePackRuleViolations(root);

  const release = args.includes('--release');
  console.log(`Building pack: ${manifest.name} v${manifest.version}${release ? ' (release)' : ''}`);

  let packConfig: PackConfig | null = null;

  // Dependencies' step build code, so this pack's flows validate against real step definitions,
  // and their manifests and build dirs, so entries naming their content formats compile with them
  const dependencyStepModules: string[] = [];
  const dependencies = new Map<string, ContentDependency>();
  const depSnapshots = new Map<string, PackSnapshot>();
  for (const [depId, depValue] of Object.entries(manifest.dependencies ?? {})) {
    const artifacts = await resolveDepFiles(root, depId, depValue);
    if (!artifacts) throw new Error(`Dependency "${depId}" could not be resolved`);
    const stepsModule = artifacts.buildDir && path.join(artifacts.buildDir, 'steps.build.mjs');
    if (stepsModule && fs.existsSync(stepsModule)) dependencyStepModules.push(stepsModule);
    dependencies.set(depId, { manifest: artifacts.snapshot.manifest, ...(artifacts.buildDir && { buildDir: artifacts.buildDir }) });
    depSnapshots.set(depId, artifacts.snapshot);
  }
  warnStaleDepTypes(root, new Map([...dependencies].map(([depId, dep]) => [depId, dep.manifest.version])));

  const content = { ...manifest.content?.sources, ...manifest.content?.artifacts };
  if (Object.keys(content).length > 0) {
    packConfig = await buildPackConfigFromManifest(manifest, root, { dependencyStepModules, dependencies });
  } else {
    console.log('No content.sources or content.artifacts in manifest. Skipping content compilation.');
  }

  const packDir = root;
  // One place for a pack's compiled content, whoever ships it: `dist/runtime/seeds/`, which staging and
  // publishing carry to `runtime/seeds/` in the installed layout. The app's apply reads that one path
  const seedsOutputDir = path.join(outputDir, PACK_LAYOUT.seedsDir);
  const snapshotPath = path.join(outputDir, PACK_LAYOUT.snapshot);

  let result: { counts: Record<string, number>; warnings: string[] } | null = null;

  if (packConfig) {
    // What the content compiles with (the dependencies' steps and the pack's), in this build's own registry: a registry
    // the process has bound (an app's, a test's) is never touched
    const registry = createPackRegistry();
    registry.registerPack({ id: manifest.id, ...await packConfig.loadDefinitions?.() });
    const options: CompilePackOptions = {
      packDir,
      outputDir: seedsOutputDir,
      packConfig,
      definitions: { steps: registry.steps(), artifacts: registry.artifacts(), blocks: registry.blocks() },
      importModule: importPackModule,
    };

    result = await compilePack(options);
  } else {
    fs.mkdirSync(seedsOutputDir, { recursive: true });
  }

  // Seed compiler modules, for dependents' entries naming this pack's formats. A pack whose formats
  // dependents can't compile with isn't built: fail before the snapshot that advertises them
  const seedCompilers = Object.fromEntries(
    Object.entries(manifest.content?.formats ?? {}).flatMap(([name, format]) => (format.compiler ? [[name, format.compiler]] : [])),
  );
  const seedCompilersBundled = Object.keys(seedCompilers).length > 0;
  if (seedCompilersBundled) {
    const bundled = await bundlePackSeedCompilers(root, outputDir, seedCompilers, { release, recordReads: reads?.forPhase('seedCompilers') });
    if (!bundled.success) throw new Error(`Seed compiler bundle failed: ${bundled.error}`);
  }

  // Every failed bundle or gate is reported, then fails the build before the snapshot is written:
  // a snapshot advertises output dependents and installs rely on
  const failures: string[] = [];
  const fail = (message: string) => {
    console.error(`\n${message}`);
    failures.push(message.split('\n')[0]);
  };

  // A dependent generates its EntityName from this pack's snapshot and its own direct dependencies'
  // — it never reads a dependency's dependencies. So a snapshot records what this pack can surface,
  // its dependencies' names included, and a chain A → B → C leaves C's names reachable in A without
  // anyone resolving snapshots transitively. A name whose shape A lacks reads as unknown values, which
  // is what an unshaped entity does anyway.
  const depTypeManifests = [...depSnapshots.values()].map((snap) => snap.types);
  const types: PackTypeManifest = {
    entities: Object.assign({}, ...depTypeManifests.map((t) => t.entities ?? {}), manifest.entities ?? {}),
    relKinds: Object.assign({}, ...depTypeManifests.map((t) => t.relKinds ?? {}), manifest.relKinds ?? {}),
  };
  // Facade types for dependents: they import this pack's entity shapes, events, services and repositories
  const defs: Record<string, string> = {};
  const packTypesFile = path.join(outputDir, PACK_LAYOUT.typesDir, `${PACK_TYPES_DEF}.d.ts`);
  const typesHash = typesInputsHash(root, depSnapshots);
  const typesStale = reuseProblem(stamps.types, distDir, typesHash)
    ?? (reads && !reads.carry('types') ? 'no reads recorded to carry' : null);
  const packTypes = typesStale === null
    ? (takeForward(distDir, outputDir, stamps.types!.files),
       nextStamps.types = stamps.types!,
       console.log('  facade types: unchanged, reused'),
       { success: true as const, content: fs.readFileSync(packTypesFile, 'utf-8') })
    : await bundlePackTypes(root, packTypesFile, reads?.forPhase('types'));
  if (typesStale !== null && packTypes.success) {
    nextStamps.types = { hash: typesHash, files: [path.join(PACK_LAYOUT.typesDir, `${PACK_TYPES_DEF}.d.ts`)] };
  }
  const packTypesProblems = packTypes.success ? facadeProblems(root, packTypesFile) : [];
  if (packTypes.success && packTypesProblems.length === 0) {
    defs[PACK_TYPES_DEF] = packTypes.content;
    // The reviewed report of this facade, held to the bundle in hand — the one moment nothing can be stale
    // about it. A **warning**, not a `fail`: the collected failures below are for output dependents cannot
    // use, and a report that has not caught up is not that. It would also mean a pack author could not start
    // the app until they had rewritten a reviewed artifact mid-change, where `facade:check` is the gate that
    // says so once — its own chain step, and CI. A pack with no report has nothing to be stale against
    if (fs.existsSync(facadeReportFile(root))) {
      const report = compareFacadeReport(root, facadeReportText(packTypes.content, root, manifest.id));
      if (report.problem) console.warn(`\nWarning: ${report.problem}`);
    }
  } else if (packTypes.success) {
    // Dependents would read these types as `any` or fail to compile against them
    fail(`Pack types aren't usable by packs that depend on this one. The types of what abuddy.json exposes (entity shapes, events, services, repositories) must check on their own and import only packages dependents have:\n${packTypesProblems.map((p) => `  - ${p}`).join('\n')}`);
  } else {
    fail(`Pack types bundle failed: ${packTypes.error}`);
  }
  // Flow helpers for dependents: their generated flow helpers re-export this pack's
  const flowHelpers = await bundlePackFlowHelpers(root, path.join(outputDir, PACK_LAYOUT.typesDir), {
    release,
    recordModuleReads: reads?.forPhase('flowHelpersModule'),
    recordTypeReads: reads?.forPhase('flowHelperTypes'),
  });
  if (!flowHelpers.success) fail(`Flow helpers bundle failed: ${flowHelpers.error}`);
  /**
   * What this pack's whole tree declares, and which pack declares each name.
   *
   * A dependent sees only its direct dependencies' snapshots, so this has to carry the tree rather
   * than just this pack: a dependent of two packs sharing an ancestor receives the ancestor's names
   * through both, and without knowing who declares them reads that as a collision. Every pack depends
   * on the base pack, so that is every diamond. It is also what lets a dependent naming a plugin it
   * only reaches transitively be told which pack to depend on, rather than that the plugin is unknown.
   */
  const provenance = _buildProvenance([...depSnapshots], { id: manifest.id, manifest });
  const snapshot: PackSnapshot = {
    types, defs, manifest, format: PACK_SNAPSHOT_FORMAT, sdkVersion: sdkVersion(),
    ...(Object.keys(provenance).length > 0 && { provenance }),
    ...(flowHelpers.success && { flowHelpers: flowHelpers.flowHelpers }),
  };
  const finish = () => {
    if (failures.length > 0) {
      throw new Error(`Build failed, so no snapshot was written:\n${failures.map((f) => `  - ${f}`).join('\n')}`);
    }
    fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
    fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
    // With the snapshot rather than per phase: both say what this build produced, and a build that failed
    // produced neither. A phase's reads are kept in memory until here so a half-finished build leaves the
    // last complete record in place rather than a partial one
    reads?.write();
    writeStamps(root, nextStamps);
    // Every phase has succeeded and the snapshot advertises them, so this is the moment the staged tree
    // becomes the pack's output — one rename, rather than the ~20s of absent `dist` that clearing it first cost
    replaceDir(outputDir, distDir);
    console.log(`\nOutput: ${path.relative(process.cwd(), distDir)}/`);
  };

  console.log(`\nBuild complete:`);
  if (result) {
    for (const [type, count] of Object.entries(result.counts)) {
      if (count > 0) console.log(`  ${type}: ${count}`);
    }

    if (result.warnings.length > 0) {
      console.log(`\nWarnings:`);
      for (const w of result.warnings) {
        console.log(`  ! ${w}`);
      }
    }
  }

  // Informational: nothing is rejected, but these entities' fields read as unknown values
  const unshaped = entitiesWithoutShapes(manifest);
  if (unshaped.length > 0) {
    console.log(`\nNote: ${unshaped.length} ${unshaped.length === 1 ? 'entity has' : 'entities have'} no shape in entityShapes, so ${unshaped.length === 1 ? 'its' : 'their'} fields read as unknown values: ${unshaped.join(', ')}`);
  }

  // ── Step build facets (for dependents' flow validation) ─────────────
  if (manifest.steps?.build) {
    const stepBuild = await bundlePackStepBuild(root, outputDir, manifest.steps.build, { release, recordReads: reads?.forPhase('stepBuild') });
    if (stepBuild.success) {
      console.log(`  step build: dist/${PACK_LAYOUT.stepsBuild}`);
    } else {
      fail(`Step build bundle failed: ${stepBuild.error}`);
    }
  }

  // ── Seed runtime (for dependents' unit tests) ─────────────────────────
  const contentRuntime = await bundlePackSeedRuntime(root, outputDir, { release, recordReads: reads?.forPhase('contentRuntime') });
  if (contentRuntime.success) {
    console.log(`  seed runtime: dist/${PACK_LAYOUT.buildDir}/${SEED_RUNTIME_FILE}`);
  } else {
    fail(`Seed runtime bundle failed: ${contentRuntime.error}`);
  }

  if (seedCompilersBundled) console.log(`  seed compilers: dist/${PACK_LAYOUT.buildDir}/${SEED_COMPILERS_FILE}`);

  // ── DSL editor definitions ───────────────────────────────────────────
  if (manifest.dsl) {
    const dslScope = abuddyScope(root);
    const dslHash = 'missing' in dslScope ? null : dslInputsHash(root, dslScope.dirs);
    const dslStale = dslHash === null ? 'scope incomplete'
      : reuseProblem(stamps.dslDefs, distDir, dslHash) ?? (reads && !reads.carry('dslDefs') ? 'no reads recorded to carry' : null);
    // Its files live in the pack's real `dist` either way, so reuse is not re-bundling them
    const defs = dslStale === null
      ? (takeForward(distDir, outputDir, stamps.dslDefs!.files),
         nextStamps.dslDefs = stamps.dslDefs!,
         console.log('  dsl defs: unchanged, reused'),
         { success: true as const, files: [] as string[] })
      : await bundleDslDefs(root, manifest, reads?.forPhase('dslDefs'));
    if (dslStale !== null && defs.success && dslHash !== null) {
      nextStamps.dslDefs = { hash: dslHash, files: defs.files.map((file) => path.relative('dist', file)) };
    }
    if (defs.success) {
      for (const file of defs.files) console.log(`  dsl defs: ${file}`);
      // **The one phase that writes outside the staged tree**, because the path its consumer uses is source
      // text rather than an argument: codegen emits `'../../dist/defs/monaco/<name>-defs.d.ts?raw'` into
      // `src/__generated__/`, and the FE bundle below resolves that from the pack's real `dist`. So the files
      // are written there and copied into the staged tree, which is what the swap then publishes — and what
      // drops a def file for a `dsl` entry this build no longer has, since the staged tree holds only these.
      // The write into the live `dist` overwrites and never clears, so nothing reading it finds a file absent.
      for (const file of defs.files) {
        const dest = path.join(outputDir, path.relative('dist', file));
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(path.join(root, file), dest);
      }
    } else {
      fail(`DSL definitions bundle failed: ${defs.error}`);
    }
  }

  // ── Backend runtime ──────────────────────────────────────────────────
  const runtimeResult = await bundlePackRuntime(root, outputDir, { release, recordReads: reads?.forPhase('runtime') });
  if (runtimeResult.success) {
    console.log(`  runtime: dist/${PACK_LAYOUT.runtimeEntry}`);
  } else {
    fail(`Runtime bundle failed: ${runtimeResult.error}`);
  }

  // ── FE bundling ──────────────────────────────────────────────────────
  const feEntry = args.includes('--skip-fe') ? null : findFEEntry(root);
  if (feEntry) {
    const feOutputDir = path.join(outputDir, PACK_LAYOUT.runtimeDir);
    const scope = abuddyScope(root);
    // No hash without the whole scope, and so no stamp either: recording one would let the next build that
    // also cannot resolve them match it and reuse a bundle compiled against who knows what
    const feHash = 'missing' in scope ? null : feInputsHash(root, { release }, scope.dirs);
    // Reused rather than skipped: the staged tree is renamed over `dist`, so the files have to be here
    // either way. `--skip-fe` is the other thing, and omits them on purpose
    const problem = feHash === null
      ? `can't resolve ${(scope as { missing: readonly string[] }).missing.join(', ')} to hash against`
      : reuseProblem(stamps.fe, distDir, feHash) ?? (reads && !reads.carry('fe') ? 'no reads recorded to carry' : null);
    if (problem === null) {
      takeForward(distDir, outputDir, stamps.fe!.files);
      nextStamps.fe = stamps.fe!;
      console.log(`  fe: unchanged, reused (${stamps.fe!.files.length} files)`);
    } else {
      const before = new Set(filesUnder(feOutputDir));
      const feResult = await bundlePackFE({ packDir: root, outputDir: feOutputDir, entryPoint: feEntry, release, recordReads: reads?.forPhase('fe') });
      if (feResult.success) {
        const written = filesUnder(feOutputDir).filter((file) => !before.has(file));
        if (feHash !== null) nextStamps.fe = { hash: feHash, files: written.map((file) => path.join(PACK_LAYOUT.runtimeDir, file)) };
        console.log(`  fe: dist/${PACK_LAYOUT.feEntry}`);
        if (fs.existsSync(path.join(outputDir, PACK_LAYOUT.feStyles))) {
          console.log(`  fe styles: dist/${PACK_LAYOUT.feStyles}`);
        }
      } else {
        fail(`FE bundle failed: ${feResult.error}`);
      }
    }
  }

  finish();
}
