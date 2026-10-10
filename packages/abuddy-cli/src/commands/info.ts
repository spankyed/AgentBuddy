import * as fs from 'node:fs';
import * as path from 'node:path';
import { findPackRoot, readManifest } from '../utils';

export async function info(_args: string[]) {
  const root = findPackRoot(process.cwd());
  const manifest = readManifest(root);

  const features = Object.keys(manifest.features ?? {}).length;
  const steps = Object.keys(manifest.extensions?.steps ?? {}).length;
  const packServices = Object.keys(manifest.extensions?.services ?? {}).length;
  const deps = manifest.dependencies ? Object.keys(manifest.dependencies).length : 0;
  const hasDist = fs.existsSync(path.join(root, 'dist'));

  // From the manifest's own paths, not a guess at the conventional directory: a pack may put its
  // content anywhere, and reporting 0 for one that does is worse than reporting nothing
  const sourceCount = (key: string): number => {
    const entry = manifest.content?.sources?.[key];
    const rel = typeof entry === 'string' ? entry : entry?.path;
    const dir = rel && path.join(root, rel);
    return dir && fs.existsSync(dir) ? countFiles(dir, '.ts') : 0;
  };
  const [actions, prompts, flows] = ['actions', 'prompts', 'flows'].map(sourceCount);

  console.log(`
  Pack:       ${manifest.id}
  Version:    ${manifest.version || 'n/a'}
  Host:       ${manifest.hostVersion || 'n/a'}

  Features:   ${features}
  Steps:      ${steps}
  Services:   ${packServices}
  Content:    ${actions} actions, ${prompts} prompts, ${flows} flows
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
