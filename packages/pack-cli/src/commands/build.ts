import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  compilePack,
  buildPackConfigFromManifest,
  resolveFeatureSettingsFromManifest,
  type CompilePackOptions, type PackConfig, type PackSnapshot, type PackTypeManifest,
} from '@abuddy/sdk/build';
import { generate } from './generate';
import { findPackRoot, readManifest } from '../utils';
import { findFEEntry, bundlePackFE } from '../fe-bundler';

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

  if (!args.includes('--skip-generate')) {
    await generate([]);
  }

  console.log(`Building pack: ${manifest.name} v${manifest.version}`);

  let packConfig: PackConfig | null = null;
  let featureSettingsPaths: Array<{ name: string; settingsPath: string }> | undefined;

  const seeds = manifest.boot?.seed;
  if (seeds && Object.keys(seeds).length > 0) {
    packConfig = await buildPackConfigFromManifest(manifest, root);
    featureSettingsPaths = resolveFeatureSettingsFromManifest(manifest, root);
  } else {
    packConfig = await loadPackConfig(root);
  }

  if (!packConfig) {
    console.log('No boot.seed in manifest and no compile.config.ts found. Skipping seed compilation.');
  }

  const packDir = root;
  const outputDir = path.join(root, 'dist');

  let result: { seeds: Record<string, number>; warnings: string[] } | null = null;

  if (packConfig) {
    const options: CompilePackOptions = {
      packDir,
      outputDir,
      packConfig,
      featureSettingsPaths,
    };

    result = await compilePack(options);
  } else {
    fs.mkdirSync(outputDir, { recursive: true });
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
  const snapshot: PackSnapshot = { types, defs, manifest };
  fs.writeFileSync(path.join(outputDir, 'snapshot.json'), JSON.stringify(snapshot, null, 2));

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

  // ── FE bundling ──────────────────────────────────────────────────────
  const feEntry = findFEEntry(root);
  if (feEntry) {
    const feResult = await bundlePackFE({ packDir: root, outputDir, entryPoint: feEntry });
    if (feResult.success) {
      console.log(`  fe: dist/fe.js`);
    } else {
      console.error(`\nFE bundle failed: ${feResult.error}`);
    }
  }

  console.log(`\nOutput: ${path.relative(process.cwd(), outputDir)}/`);
}
