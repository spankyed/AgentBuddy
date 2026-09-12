import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import type { PackManifest } from '@abuddy/sdk/build';
import type { AppEnv } from '@abuddy/sdk/env';

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

const cliRequire = createRequire(import.meta.url);

/** The @abuddy/sdk package this CLI runs against. */
export function sdkPackageDir(): string {
  return path.dirname(cliRequire.resolve('@abuddy/sdk/package.json'));
}

export function sdkVersion(): string | undefined {
  try {
    return JSON.parse(fs.readFileSync(path.join(sdkPackageDir(), 'package.json'), 'utf-8')).version;
  } catch {
    return undefined;
  }
}

export function cliVersion(): string {
  return JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'package.json'), 'utf-8')).version;
}

export function ensureSdkLink(cwd: string): void {
  const sdkRoot = sdkPackageDir();
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
