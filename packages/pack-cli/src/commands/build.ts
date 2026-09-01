import * as fs from 'node:fs';
import * as path from 'node:path';
import { compilePack, registerSeedCompiler, type CompilePackOptions, type PackConfig, type PackSnapshot, type PackTypeManifest } from '@abuddy/sdk/build';
import { generate } from './generate';
import { findPackRoot, readManifest } from '../utils';

async function registerDepCompilers(root: string, depId: string): Promise<void> {
  const candidates = [
    // Workspace siblings (same paths as fetch-deps resolver)
    path.resolve(root, '..', depId, 'pack.config.ts'),
    path.resolve(root, '..', '..', 'packages', depId, 'pack.config.ts'),
    path.resolve(root, '..', '..', depId, 'pack.config.ts'),
    // node_modules (npm-installed dep)
    path.resolve(root, 'node_modules', '@abuddy-pack', depId, 'pack.config.ts'),
    path.resolve(root, 'node_modules', '@app', depId, 'pack.config.ts'),
  ];

  for (const configPath of candidates) {
    if (!fs.existsSync(configPath)) continue;

    const { tsImport } = await import('tsx/esm/api');
    const mod = await tsImport(configPath, import.meta.url);
    const config = (mod.default ?? mod) as PackConfig;

    if (config.compilers) {
      for (const { type, compiler } of config.compilers) {
        registerSeedCompiler(type, compiler);
      }
    }
    return;
  }

  console.warn(`  Warning: could not find pack.config.ts for dependency "${depId}" — custom compilers won't be available`);
}

export async function build(args: string[]) {
  const root = findPackRoot(process.cwd());
  const manifest = readManifest(root);

  if (!args.includes('--skip-generate')) {
    await generate([]);
  }

  const deps = Object.keys(manifest.dependencies ?? {});
  for (const depId of deps) {
    await registerDepCompilers(root, depId);
  }

  console.log(`Building pack: ${manifest.name} v${manifest.version}`);

  const packDir = root;
  const pluginsDir = path.join(root, 'src', 'plugins');
  const outputDir = path.join(root, 'dist');
  const baseSettingsFile = fs.existsSync(path.join(root, 'src', 'base-settings.ts'))
    ? path.join(root, 'src', 'base-settings.ts')
    : undefined;

  if (!fs.existsSync(path.join(root, 'pack.config.ts'))) {
    console.log('No pack.config.ts found. Nothing to compile.');
    return;
  }

  const options: CompilePackOptions = {
    packDir,
    pluginsDir: fs.existsSync(pluginsDir) ? pluginsDir : undefined,
    outputDir,
    baseSettingsFile,
  };

  const result = await compilePack(options);

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
  for (const [type, count] of Object.entries(result.seeds)) {
    if (count > 0) console.log(`  ${type}: ${count}`);
  }

  if (result.warnings.length > 0) {
    console.log(`\nWarnings:`);
    for (const w of result.warnings) {
      console.log(`  ! ${w}`);
    }
  }

  console.log(`\nOutput: ${path.relative(process.cwd(), outputDir)}/`);
}
