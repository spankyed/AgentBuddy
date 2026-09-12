import * as fs from 'node:fs';
import * as path from 'node:path';
import tar from 'tar';
import { findPackRoot, readManifest } from '../utils';

const PACK_CONTENTS = ['abuddy.json', 'dist'];

export async function pack(_args: string[]) {
  const root = findPackRoot(process.cwd());
  const manifest = readManifest(root);

  const missing = PACK_CONTENTS.filter(p => !fs.existsSync(path.join(root, p)));
  if (missing.length > 0) {
    throw new Error(`Missing: ${missing.join(', ')}. Run "abuddy build" first.`);
  }

  if (!fs.existsSync(path.join(root, 'dist', 'snapshot.json'))) {
    throw new Error('No dist/snapshot.json. Run "abuddy build" first.');
  }

  const entries = [...PACK_CONTENTS];
  if (fs.existsSync(path.join(root, 'defs'))) {
    entries.push('defs');
  }

  const filename = `${manifest.id}-${manifest.version}.tgz`;
  const outputPath = path.join(root, filename);

  await tar.create(
    {
      gzip: true,
      file: outputPath,
      cwd: root,
      prefix: manifest.id,
    },
    entries,
  );

  const stats = fs.statSync(outputPath);
  const sizeKB = (stats.size / 1024).toFixed(1);

  console.log(`Packed ${filename} (${sizeKB} KB)`);
  console.log(`\nContents:`);
  for (const entry of entries) {
    console.log(`  ${entry}/`);
  }
  console.log(`\nUpload this file as a GitHub release asset.`);
}
