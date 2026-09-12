import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import type { PackTypeManifest, PackSnapshot } from '../../build';
import { generatePackFiles } from '../../build';
import { findPackRoot, readManifest } from '../utils';

const HASH_FILE = '.inputs-hash';
const TEMPLATE_PATH = path.resolve(import.meta.dirname, '../../build/generate-entries.ts');

function computeInputsHash(root: string): string {
  const hash = createHash('sha256');
  hash.update(fs.readFileSync(path.join(root, 'abuddy.json'), 'utf-8'));
  hash.update(fs.readFileSync(TEMPLATE_PATH, 'utf-8'));
  const depsDir = path.join(root, '.abuddy', 'deps');
  if (fs.existsSync(depsDir)) {
    for (const depId of fs.readdirSync(depsDir).sort()) {
      const snapPath = path.join(depsDir, depId, 'snapshot.json');
      if (fs.existsSync(snapPath)) {
        hash.update(depId);
        hash.update(fs.readFileSync(snapPath, 'utf-8'));
      }
    }
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

  const currentHash = computeInputsHash(root);

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
