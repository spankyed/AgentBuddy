import * as fs from 'node:fs';
import * as path from 'node:path';
import type { PackManifest } from '../build';
import type { AppEnv } from '../env';

const ENV_FLAGS = ['-d', '--dev', '-b', '--beta'] as const;

export function parseTargetEnv(args: string[]): { env: AppEnv; args: string[] } {
  const hasDev = args.includes('-d') || args.includes('--dev');
  const hasBeta = args.includes('-b') || args.includes('--beta');
  const filtered = args.filter(a => !(ENV_FLAGS as readonly string[]).includes(a));
  const env: AppEnv = hasBeta ? 'beta' : hasDev ? 'development' : 'production';
  return { env, args: filtered };
}

export function envLabel(env: AppEnv): string {
  if (env === 'production') return '';
  return ` (${env})`;
}

export const TARGET_ENV_USAGE = '-d, --dev    Target the dev environment\n  -b, --beta   Target the beta environment';

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
