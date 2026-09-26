import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { parseManifest, type PackManifest } from '@abuddy/sdk/build';
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

/** The pack's manifest, or an error listing why the installer would reject it */
export function readValidManifest(root: string): PackManifest {
  const manifest = readManifest(root);
  const { errors } = parseManifest(manifest);
  if (errors.length > 0) {
    throw new Error(`abuddy.json is invalid:\n${errors.map(e => `  - ${e}`).join('\n')}`);
  }
  return manifest;
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

/** This CLI's bin (from src/ in the workspace, dist/ when published). */
export function cliBin(): string {
  return path.join(import.meta.dirname, '..', 'bin', 'abuddy.mjs');
}

export function cliVersion(): string {
  return JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'package.json'), 'utf-8')).version;
}

/**
 * The vitest CLI the pack resolves. `createRequire` walks up, so this finds a pack's own devDependency and,
 * for a fixture pack inside this monorepo that declares none, the hoisted copy — which is the same binary
 * `tests/scripts/` used to invoke by path.
 */
export function resolveVitestCli(packDir: string): string {
  const from = path.join(packDir, 'package.json');
  let pkgPath: string;
  try {
    pkgPath = createRequire(from).resolve('vitest/package.json');
  } catch {
    throw new Error('vitest is not installed in this pack. Run: npm i -D vitest');
  }
  const bin = (JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { bin?: string | Record<string, string> }).bin;
  const entry = typeof bin === 'string' ? bin : bin?.vitest;
  if (!entry) throw new Error(`The vitest at ${pkgPath} declares no bin`);
  return fs.realpathSync(path.join(path.dirname(pkgPath), entry));
}
