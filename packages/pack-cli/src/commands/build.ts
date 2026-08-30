import * as fs from 'node:fs';
import * as path from 'node:path';
import { compilePack, type CompilePackOptions } from '@app/default-setup/build';
import { generate } from './generate';

function findPackRoot(from: string): string {
  let dir = from;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'abuddy.json'))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error('No abuddy.json found. Run this command from inside a pack directory, or run "abuddy init" first.');
}

export async function build(_args: string[]) {
  const root = findPackRoot(process.cwd());
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'abuddy.json'), 'utf-8'));

  await generate([]);

  console.log(`Building pack: ${manifest.name} v${manifest.version}`);

  const featuresDir = path.join(root, 'src', 'features');
  const sharedDir = path.join(root, 'src', 'shared');
  const outputDir = path.join(root, 'dist');
  const baseSettingsFile = fs.existsSync(path.join(root, 'src', 'base-settings.ts'))
    ? path.join(root, 'src', 'base-settings.ts')
    : undefined;

  if (!fs.existsSync(featuresDir)) {
    console.log('No src/features/ directory found. Nothing to compile.');
    return;
  }

  const options: CompilePackOptions = {
    featuresDir,
    sharedDir: fs.existsSync(sharedDir) ? sharedDir : undefined,
    outputDir,
    baseSettingsFile,
  };

  const result = await compilePack(options);

  const typeManifest = {
    entities: manifest.entities ?? {},
    relKinds: manifest.relKinds ?? {},
  };
  fs.writeFileSync(path.join(outputDir, 'types.json'), JSON.stringify(typeManifest, null, 2));

  console.log(`\nBuild complete:`);
  if (result.actions > 0) console.log(`  Actions:  ${result.actions}`);
  if (result.prompts > 0) console.log(`  Prompts:  ${result.prompts}`);
  if (result.flows > 0) console.log(`  Flows:    ${result.flows}`);
  if (result.libraryDocs > 0) console.log(`  Library:  ${result.libraryDocs} docs`);
  if (result.notes > 0) console.log(`  Notes:    ${result.notes}`);
  if (result.faqs > 0) console.log(`  FAQs:     ${result.faqs}`);

  if (result.warnings.length > 0) {
    console.log(`\nWarnings:`);
    for (const w of result.warnings) {
      console.log(`  ⚠ ${w}`);
    }
  }

  console.log(`\nOutput: ${path.relative(process.cwd(), outputDir)}/`);
}
