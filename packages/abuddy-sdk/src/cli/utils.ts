import * as fs from 'node:fs';
import * as path from 'node:path';
import type { PackManifest } from '../build';

export function findPackRoot(from: string): string {
  let dir = from;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'abuddy.json'))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error('No abuddy.json found. Run this command from inside a pack directory.');
}

export function readManifest(root: string): PackManifest {
  return JSON.parse(fs.readFileSync(path.join(root, 'abuddy.json'), 'utf-8'));
}

export function ensureSdkLink(cwd: string): void {
  const sdkRoot = path.resolve(import.meta.dirname, '..', '..');
  const linkPath = path.join(cwd, 'node_modules', '@abuddy', 'sdk');

  try {
    const stat = fs.lstatSync(linkPath);
    if (!stat.isSymbolicLink()) return;
    const target = fs.realpathSync(linkPath);
    if (target === fs.realpathSync(sdkRoot)) return;
    fs.unlinkSync(linkPath);
  } catch (err: any) {
    if (err?.code !== 'ENOENT') {
      // Broken symlink: lstat succeeds but realpathSync fails
      try { fs.unlinkSync(linkPath); } catch {}
    }
  }

  if (fs.existsSync(linkPath)) return;
  fs.mkdirSync(path.join(cwd, 'node_modules', '@abuddy'), { recursive: true });
  fs.symlinkSync(sdkRoot, linkPath, 'dir');
}
