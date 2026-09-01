import * as fs from 'node:fs';
import * as path from 'node:path';
import { compilePack, type CompilePackOptions, type PackSnapshot, type PackTypeManifest } from '@abuddy/sdk/build';
import { registerDefaultCompilers } from '@app/default-setup/build';
import { generate } from './generate';
import { findPackRoot, readManifest } from '../utils';

export async function build(_args: string[]) {
  const root = findPackRoot(process.cwd());
  const manifest = readManifest(root);

  await generate([]);

  registerDefaultCompilers();
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
  fs.writeFileSync(path.join(outputDir, 'types.json'), JSON.stringify(types, null, 2));

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
