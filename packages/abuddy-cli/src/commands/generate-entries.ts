import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import type { PackTypeManifest, PackSnapshot } from '@abuddy/sdk/build';
import { generatePackFiles } from '@abuddy/sdk/build';
import { findPackRoot, readManifest, sdkPackageDir, sdkVersion } from '../utils';
import { resolveDeps } from './generate';

const HASH_FILE = '.inputs-hash';
// Hash the codegen implementation too, so SDK upgrades regenerate entries
function codegenSource(): string {
  const sdkDir = sdkPackageDir();
  // Workspace source, then the published compiled output
  for (const file of ['src/build/generate-entries.ts', 'build/generate-entries.js']) {
    const candidate = path.join(sdkDir, file);
    if (fs.existsSync(candidate)) return fs.readFileSync(candidate, 'utf-8');
  }
  return sdkVersion() ?? '';
}

function computeInputsHash(root: string, depSnapshots: Map<string, PackSnapshot>): string {
  const hash = createHash('sha256');
  hash.update(fs.readFileSync(path.join(root, 'abuddy.json'), 'utf-8'));
  hash.update(codegenSource());
  // Generated flow helpers and types depend on every resolved dependency, wherever it came from
  for (const depId of [...depSnapshots.keys()].sort()) {
    hash.update(depId);
    hash.update(JSON.stringify(depSnapshots.get(depId)));
  }
  return hash.digest('hex');
}

export async function generateEntries(
  _args: string[],
  packRoot?: string,
  depTypes?: Map<string, PackTypeManifest>,
  depSnapshots?: Map<string, PackSnapshot>,
) {
  const root = packRoot ?? findPackRoot(process.cwd());
  const outDir = path.join(root, 'src/__generated__');
  const hashPath = path.join(outDir, HASH_FILE);
  const force = _args.includes('--force');

  if (!depSnapshots) {
    const resolved = await resolveDeps(root, readManifest(root).dependencies);
    depTypes = resolved.depTypes;
    depSnapshots = resolved.depSnapshots;
  }
  const currentHash = computeInputsHash(root, depSnapshots);

  if (!force && fs.existsSync(hashPath)) {
    const storedHash = fs.readFileSync(hashPath, 'utf-8').trim();
    if (storedHash === currentHash) {
      console.log('generate-entries: inputs unchanged, skipping (use --force to regenerate)');
      return;
    }
  }

  const manifest = readManifest(root);
  fs.mkdirSync(outDir, { recursive: true });

  const files = generatePackFiles(manifest, { packRoot: root, depTypes, depSnapshots });

  for (const [filePath, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(root, filePath), content);
  }

  fs.writeFileSync(hashPath, currentHash + '\n');

  console.log('Generated:');
  for (const filePath of Object.keys(files)) {
    console.log(`  ${filePath}`);
  }
}
