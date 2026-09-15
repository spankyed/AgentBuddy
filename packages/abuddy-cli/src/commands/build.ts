import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  clearCompiledSeeds,
  compilePack,
  buildPackConfigFromManifest,
  parseManifest,
  resolveFeatureSettingsFromManifest,
  PACK_TYPES_DEF,
  entitiesWithoutShapes,
  SEED_COMPILERS_FILE,
  type CompilePackOptions, type PackConfig, type PackSnapshot, type PackTypeManifest, type SeedDependency,
} from '@abuddy/sdk/build';
import { findFEEntry, bundlePackFE } from '../build/fe-bundler';
import { bundlePackRuntime, bundlePackSeedCompilers, bundlePackSeedRuntime, bundlePackStepBuild, SEED_RUNTIME_FILE } from '../build/be-bundler';
import { bundlePackTypes } from '../build/types-bundler';
import { BUNDLE_PATHS } from '@abuddy/host/packs';
import { checkFeatureSettings } from '@abuddy/sdk/framework';
import { generate, resolveDeps } from './generate';
import { resolveDepArtifacts } from './fetch-deps';
import { generateEntries } from './generate-entries';
import { findPackRoot, readManifest, sdkVersion } from '../utils';

/** Loads a pack's seed compiler module, which may be TypeScript */
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

/** A built-in pack's snapshot, in its in-repo dist/ layout */
const BUILT_IN_SNAPSHOT = 'snapshot.json';

/**
 * Removes the previous build's output before anything can fail, so a failed build or a dropped
 * output never leaves an older file behind.
 * - External packs build into the bundle layout (runtime/, build/, types/); dist/ is pure output,
 *   cleared whole, so `abuddy pack` and the test fixture never ship an older build.
 * - Built-in packs keep their in-repo layout, where rollup writes dist/defs/ (generate:defs): the
 *   compiled seeds, build/, types/ and snapshot go, and runtime/, which dev-build.mjs writes after
 *   this build in the pack's `npm run build`. The app publishes the runtime with the seeds and build/
 *   to dependents, so a build that fails or doesn't reach dev-build.mjs leaves no older runtime to
 *   pair with them (in development the API loads the pack from source when it has no runtime).
 */
export function clearBuildOutput(outputDir: string, { builtIn }: { builtIn: boolean }): void {
  const owned = builtIn ? [BUNDLE_PATHS.buildDir, BUNDLE_PATHS.typesDir, BUNDLE_PATHS.runtimeDir, BUILT_IN_SNAPSHOT] : ['.'];
  for (const entry of owned) fs.rmSync(path.join(outputDir, entry), { recursive: true, force: true });
  if (builtIn) clearCompiledSeeds(outputDir);
}

export async function build(args: string[]) {
  const root = findPackRoot(process.cwd());
  const manifest = readManifest(root);
  // The installer rejects an invalid manifest; don't build (or let CI publish) one
  const { errors: manifestErrors } = parseManifest(manifest);
  if (manifestErrors.length > 0) {
    throw new Error(`abuddy.json is invalid:\n${manifestErrors.map(e => `  - ${e}`).join('\n')}`);
  }

  const outputDir = path.join(root, 'dist');
  const external = !manifest.builtIn;
  clearBuildOutput(outputDir, { builtIn: !external });

  if (!args.includes('--skip-generate')) {
    const { depTypes, depSnapshots } = await resolveDeps(root, manifest.dependencies);
    await generate([], undefined, depSnapshots);
    await generateEntries([], undefined, depTypes, depSnapshots);
  }

  const settingsProblems = await featureSettingsProblems(root, manifest.features ?? []);
  if (settingsProblems.length > 0) {
    throw new Error(`Invalid feature settings:\n${settingsProblems.map(p => `  - ${p}`).join('\n')}`);
  }

  const release = args.includes('--release');
  console.log(`Building pack: ${manifest.name} v${manifest.version}${release ? ' (release)' : ''}`);

  let packConfig: PackConfig | null = null;
  let featureSettingsPaths: Array<{ name: string; settingsPath: string }> | undefined;

  // Dependencies' step build code, so this pack's flows validate against real step definitions,
  // and their manifests and build dirs, so entries naming their seed formats compile with them
  const dependencyStepModules: string[] = [];
  const dependencies = new Map<string, SeedDependency>();
  for (const [depId, depValue] of Object.entries(manifest.dependencies ?? {})) {
    const artifacts = await resolveDepArtifacts(root, depId, depValue);
    if (!artifacts) throw new Error(`Dependency "${depId}" could not be resolved`);
    const stepsModule = artifacts.buildDir && path.join(artifacts.buildDir, 'steps.build.mjs');
    if (stepsModule && fs.existsSync(stepsModule)) dependencyStepModules.push(stepsModule);
    dependencies.set(depId, { manifest: artifacts.snapshot.manifest, ...(artifacts.buildDir && { buildDir: artifacts.buildDir }) });
  }

  const seeds = manifest.boot?.seed;
  if (seeds && Object.keys(seeds).length > 0) {
    packConfig = await buildPackConfigFromManifest(manifest, root, { dependencyStepModules, dependencies });
    featureSettingsPaths = resolveFeatureSettingsFromManifest(manifest, root);
  } else {
    console.log('No boot.seed in manifest. Skipping seed compilation.');
  }

  const packDir = root;
  const seedsOutputDir = external ? path.join(outputDir, BUNDLE_PATHS.seedsDir) : outputDir;
  const snapshotPath = path.join(outputDir, external ? BUNDLE_PATHS.snapshot : BUILT_IN_SNAPSHOT);

  let result: { seeds: Record<string, number>; warnings: string[] } | null = null;

  if (packConfig) {
    const options: CompilePackOptions = {
      packDir,
      outputDir: seedsOutputDir,
      packConfig,
      featureSettingsPaths,
      importModule: importPackModule,
    };

    result = await compilePack(options);
  } else {
    fs.mkdirSync(seedsOutputDir, { recursive: true });
  }

  const types: PackTypeManifest = {
    entities: manifest.entities ?? {},
    relKinds: manifest.relKinds ?? {},
  };

  // Facade types for dependents: they import this pack's entity shapes, events, services and repositories
  const defs: Record<string, string> = {};
  const packTypes = await bundlePackTypes(root, path.join(outputDir, BUNDLE_PATHS.typesDir, `${PACK_TYPES_DEF}.d.ts`));
  if (packTypes.success) {
    defs[PACK_TYPES_DEF] = packTypes.content;
  } else {
    console.error(`\nPack types bundle failed: ${packTypes.error}`);
    process.exitCode = 1;
  }
  const snapshot: PackSnapshot = { types, defs, manifest, sdkVersion: sdkVersion() };
  fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));

  console.log(`\nBuild complete:`);
  if (result) {
    for (const [type, count] of Object.entries(result.seeds)) {
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
    const stepBuild = await bundlePackStepBuild(root, outputDir, manifest.steps.build, { release });
    if (stepBuild.success) {
      console.log(`  step build: dist/${BUNDLE_PATHS.stepsBuild}`);
    } else {
      console.error(`\nStep build bundle failed: ${stepBuild.error}`);
      process.exitCode = 1;
    }
  }

  // ── Seed runtime (for dependents' unit tests) ─────────────────────────
  const seedRuntime = await bundlePackSeedRuntime(root, outputDir, { release });
  if (seedRuntime.success) {
    console.log(`  seed runtime: dist/${BUNDLE_PATHS.buildDir}/${SEED_RUNTIME_FILE}`);
  } else {
    console.error(`\nSeed runtime bundle failed: ${seedRuntime.error}`);
    process.exitCode = 1;
  }

  // ── Seed compiler modules (for dependents' entries naming this pack's formats) ──
  const seedCompilers = Object.fromEntries(
    Object.entries(manifest.seedFormats ?? {}).flatMap(([name, format]) => (format.compiler ? [[name, format.compiler]] : [])),
  );
  if (Object.keys(seedCompilers).length > 0) {
    const bundled = await bundlePackSeedCompilers(root, outputDir, seedCompilers, { release });
    if (bundled.success) {
      console.log(`  seed compilers: dist/${BUNDLE_PATHS.buildDir}/${SEED_COMPILERS_FILE}`);
    } else {
      console.error(`\nSeed compiler bundle failed: ${bundled.error}`);
      process.exitCode = 1;
    }
  }

  if (!external) {
    // Built-in packs' FE is compiled into the renderer (virtual:built-in-packs) and their
    // backend into the API bundle, never loaded from dist/
    console.log(`\nOutput: ${path.relative(process.cwd(), outputDir)}/`);
    return;
  }

  // ── Backend runtime ──────────────────────────────────────────────────
  const runtimeResult = await bundlePackRuntime(root, outputDir, { release });
  if (runtimeResult.success) {
    console.log(`  runtime: dist/${BUNDLE_PATHS.runtimeEntry}`);
  } else {
    console.error(`\nRuntime bundle failed: ${runtimeResult.error}`);
    process.exitCode = 1;
  }

  // ── FE bundling ──────────────────────────────────────────────────────
  const feEntry = args.includes('--skip-fe') ? null : findFEEntry(root);
  if (feEntry) {
    const feOutputDir = path.join(outputDir, BUNDLE_PATHS.runtimeDir);
    const feResult = await bundlePackFE({ packDir: root, outputDir: feOutputDir, entryPoint: feEntry, release });
    if (feResult.success) {
      console.log(`  fe: dist/${BUNDLE_PATHS.feEntry}`);
      if (fs.existsSync(path.join(outputDir, BUNDLE_PATHS.feStyles))) {
        console.log(`  fe styles: dist/${BUNDLE_PATHS.feStyles}`);
      }
    } else {
      console.error(`\nFE bundle failed: ${feResult.error}`);
      process.exitCode = 1;
    }
  }

  console.log(`\nOutput: ${path.relative(process.cwd(), outputDir)}/`);
}
