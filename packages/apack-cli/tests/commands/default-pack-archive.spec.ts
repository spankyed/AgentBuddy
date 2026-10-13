import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { buildPackArchive } from '../../src/commands/archive';
import { extractPackArchive, verifyPack } from '@apackdev/host/packs';

it('archives the real default-setup build as a verified pack without a manifest privilege', async () => {
  const root = fileURLToPath(new URL('../../../default-setup/', import.meta.url));
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-default-archive-'));
  try {
    const archive = await buildPackArchive(root, output);
    const extracted = await extractPackArchive(archive.file, path.join(output, 'extracted'));
    const integrity = verifyPack(extracted);
    expect(integrity.id).toBe('default-setup');
    expect(fs.readFileSync(archive.checksumFile, 'utf8')).toContain(archive.sha256);
    const manifest = JSON.parse(fs.readFileSync(path.join(extracted, 'apack.json'), 'utf8'));
    expect(manifest.id).toBe('default-setup');
    expect(manifest).not.toHaveProperty('builtIn');
  } finally { fs.rmSync(output, { recursive: true, force: true }); }
});
