import * as fs from 'node:fs';
import * as path from 'node:path';
import type { PackTypeManifest } from '../../build';
import { generatePackFiles } from '../../build';
import { findPackRoot, readManifest } from '../utils';

export async function generateEntries(
  _args: string[],
  packRoot?: string,
  depTypes?: Map<string, PackTypeManifest>,
) {
  const root = packRoot ?? findPackRoot(process.cwd());
  const manifest = readManifest(root);

  const outDir = path.join(root, 'src/__generated__');
  fs.mkdirSync(outDir, { recursive: true });

  const files = generatePackFiles(manifest, { packRoot: root, depTypes });

  for (const [filePath, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(root, filePath), content);
  }

  console.log('Generated:');
  for (const filePath of Object.keys(files)) {
    console.log(`  ${filePath}`);
  }
}
