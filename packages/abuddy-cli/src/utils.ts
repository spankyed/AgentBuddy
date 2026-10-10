import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { parseManifest, type PackManifest } from '@abuddy/sdk/build';
import { APP_ENVS, type AppEnv } from '@abuddy/sdk/env';

const ENV_FLAGS = ['-d', '--dev', '-b', '--beta', '--production'] as const;

/**
 * Which build's data a command is pointed at.
 *
 * **`-d`, `-b` and `--production` are `--build` shorthands**, which is Decision 4 of the vocabulary
 * change: they keep working and change what they *mean*, a build rather than an environment. `--build
 * <name>` says the same thing in the one word the whole CLI now uses, so a reader who learned the flag on
 * `abuddy dev` does not have to learn a second spelling here.
 *
 * It names a **build**, never a profile: a build keeps its own default storage, and `--profile` is the one
 * override. That is the fusion kept where it is harmless — a default, stated once, rather than a second
 * meaning the word carries everywhere.
 */
export function parseTargetEnv(args: string[]): { env: AppEnv; args: string[] } {
  const filtered: string[] = [];
  let named: AppEnv | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    const [name, inline] = arg.startsWith('--') ? arg.split(/=(.*)/s, 2) as [string, string | undefined] : [arg, undefined];
    if (name === '--build') {
      const value = inline ?? args[++i];
      if (!value) throw new Error('--build needs a build name: ' + APP_ENVS.join(', '));
      if (!(APP_ENVS as readonly string[]).includes(value)) {
        throw new Error(`Unknown build "${value}". This command reads a build's data, so it takes one of: ${APP_ENVS.join(', ')}.`);
      }
      named = value as AppEnv;
    } else if ((ENV_FLAGS as readonly string[]).includes(arg)) {
      named = arg === '-b' || arg === '--beta' ? 'beta' : arg === '--production' ? 'production' : 'development';
    } else {
      filtered.push(arg);
    }
  }
  return { env: named ?? 'production', args: filtered };
}

export function envLabel(env: AppEnv): string {
  if (env === 'production') return '';
  return ` (${env})`;
}

export const TARGET_ENV_USAGE = '--build <name>  Which build\'s data: ' + APP_ENVS.join(', ')
  + '\n  -d, -b, --production  shorthands for development, beta and production';

/**
 * The pack at or above `from`, or undefined.
 *
 * Every command but one wants the throwing form below: they act on a pack, and having none is the end of
 * it. `abuddy drive` is the exception — driving the app with no pack under test is a coherent thing to do,
 * and this is what lets it say so rather than treating it as a failure.
 */
export function findPackRootOrNone(from: string): string | undefined {
  let dir = from;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'abuddy.json'))) return dir;
    dir = path.dirname(dir);
  }
  return undefined;
}

export function findPackRoot(from: string): string {
  const root = findPackRootOrNone(from);
  if (root === undefined) throw new Error('No abuddy.json found. Run this command from inside a pack directory.');
  return root;
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
