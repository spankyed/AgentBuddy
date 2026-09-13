import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  compilePack,
  buildPackConfigFromManifest,
  parseManifest,
  resolveFeatureSettingsFromManifest,
  type CompilePackOptions, type PackConfig, type PackSnapshot, type PackTypeManifest,
} from '@abuddy/sdk/build';
import { findFEEntry, bundlePackFE } from '../build/fe-bundler';
import { bundlePackRuntime, bundlePackStepBuild } from '../build/be-bundler';
import { BUNDLE_PATHS } from '@abuddy/sdk/packs';
import { generate, resolveDeps } from './generate';
import { resolveDepArtifacts } from './fetch-deps';
import { generateEntries } from './generate-entries';
import { findPackRoot, readManifest, sdkVersion } from '../utils';

async function loadPackConfig(root: string): Promise<PackConfig | null> {
  const configPath = path.join(root, 'compile.config.ts');
  if (!fs.existsSync(configPath)) return null;

  console.warn('Warning: compile.config.ts is deprecated. Move seed paths to the "seeds" section in abuddy.json.');
  const { tsImport } = await import('tsx/esm/api');
  const mod = await tsImport(configPath, import.meta.url);
  return (mod.default ?? mod) as PackConfig;
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
  // External packs build into the bundle layout (runtime/, build/, types/). dist/ is pure
  // output, so clear it before anything can fail: a failed build must never leave an older
  // build behind for `abuddy pack` or the test fixture to ship.
  // Built-in packs keep their in-repo layout (dist/*.seed.json, dist/snapshot.json, dev-entry.cjs).
  const external = !manifest.builtIn;
  if (external) fs.rmSync(outputDir, { recursive: true, force: true });

  if (!args.includes('--skip-generate')) {
    const { depTypes, depSnapshots } = await resolveDeps(root, manifest.dependencies);
    await generate([], undefined, depSnapshots);
    await generateEntries([], undefined, depTypes, depSnapshots);
  }

  const release = args.includes('--release');
  console.log(`Building pack: ${manifest.name} v${manifest.version}${release ? ' (release)' : ''}`);

  let packConfig: PackConfig | null = null;
  let featureSettingsPaths: Array<{ name: string; settingsPath: string }> | undefined;

  // Dependencies' step build code, so this pack's flows validate against real step definitions
  const dependencyStepModules: string[] = [];
  for (const [depId, depValue] of Object.entries(manifest.dependencies ?? {})) {
    const artifacts = await resolveDepArtifacts(root, depId, depValue);
    if (!artifacts) throw new Error(`Dependency "${depId}" could not be resolved`);
    const stepsModule = artifacts.buildDir && path.join(artifacts.buildDir, 'steps.build.mjs');
    if (stepsModule && fs.existsSync(stepsModule)) dependencyStepModules.push(stepsModule);
  }

  const seeds = manifest.boot?.seed;
  if (seeds && Object.keys(seeds).length > 0) {
    packConfig = await buildPackConfigFromManifest(manifest, root, { dependencyStepModules });
    featureSettingsPaths = resolveFeatureSettingsFromManifest(manifest, root);
  } else {
    packConfig = await loadPackConfig(root);
  }

  if (!packConfig) {
    console.log('No boot.seed in manifest and no compile.config.ts found. Skipping seed compilation.');
  }

  const packDir = root;
  const seedsOutputDir = external ? path.join(outputDir, BUNDLE_PATHS.seedsDir) : outputDir;
  const snapshotPath = external ? path.join(outputDir, BUNDLE_PATHS.snapshot) : path.join(outputDir, 'snapshot.json');

  let result: { seeds: Record<string, number>; warnings: string[] } | null = null;

  if (packConfig) {
    const options: CompilePackOptions = {
      packDir,
      outputDir: seedsOutputDir,
      packConfig,
      featureSettingsPaths,
    };

    result = await compilePack(options);
  } else {
    fs.mkdirSync(seedsOutputDir, { recursive: true });
  }

  const types: PackTypeManifest = {
    entities: manifest.entities ?? {},
    relKinds: manifest.relKinds ?? {},
  };

  const defsDir = path.join(root, 'defs');
  const defs: Record<string, string> = {};
  if (fs.existsSync(defsDir)) {
    for (const file of fs.readdirSync(defsDir)) {
      if (!file.endsWith('.d.ts')) continue;
      defs[file.replace(/\.d\.ts$/, '')] = fs.readFileSync(path.join(defsDir, file), 'utf-8');
    }
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
