import * as fs from 'node:fs';
import * as path from 'node:path';
import { findPackRoot } from '../utils';

export async function info(_args: string[]) {
  const root = findPackRoot(process.cwd());
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'abuddy.json'), 'utf-8'));

  const features = manifest.features?.length ?? 0;
  const steps = Array.isArray(manifest.steps?.definitions) ? manifest.steps.definitions.length : 0;
  const packServices = manifest.packServices ? Object.keys(manifest.packServices).length : 0;
  const deps = manifest.dependencies ? Object.keys(manifest.dependencies).length : 0;
  const hasDist = fs.existsSync(path.join(root, 'dist'));

  const seedDir = path.join(root, 'src', 'seeds');
  let actions = 0, prompts = 0, flows = 0;
  if (fs.existsSync(path.join(seedDir, 'actions'))) {
    actions = countFiles(path.join(seedDir, 'actions'), '.ts');
  }
  if (fs.existsSync(path.join(seedDir, 'prompts'))) {
    prompts = countFiles(path.join(seedDir, 'prompts'), '.ts');
  }
  if (fs.existsSync(path.join(seedDir, 'flows'))) {
    flows = countFiles(path.join(seedDir, 'flows'), '.ts');
  }

  console.log(`
  Pack:       ${manifest.id}
  Version:    ${manifest.version || 'n/a'}
  Host:       ${manifest.hostVersion || 'n/a'}

  Features:   ${features}
  Steps:      ${steps}
  Services:   ${packServices}
  Seeds:      ${actions} actions, ${prompts} prompts, ${flows} flows
  Deps:       ${deps}

  Built:      ${hasDist ? 'yes' : 'no'}
  Root:       ${root}
`.trimEnd());
}

function countFiles(dir: string, ext: string): number {
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      count += countFiles(path.join(dir, entry.name), ext);
    } else if (entry.name.endsWith(ext) && !entry.name.startsWith('_')) {
      count++;
    }
  }
  return count;
}
