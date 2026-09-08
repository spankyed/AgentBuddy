import * as fs from 'node:fs';
import * as path from 'node:path';
import { generatePackFiles } from '@abuddy/sdk/build';
import { findPackRoot, readManifest } from '../utils';

export async function generateEntries(_args: string[], packRoot?: string) {
  const root = packRoot ?? findPackRoot(process.cwd());
  const manifest = readManifest(root);

  const outDir = path.join(root, 'src/__generated__');
  fs.mkdirSync(outDir, { recursive: true });

  const files = generatePackFiles(manifest, { packRoot: root });

  for (const [filePath, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(root, filePath), content);
  }

  console.log('Generated:');
  for (const filePath of Object.keys(files)) {
    console.log(`  ${filePath}`);
  }
}
