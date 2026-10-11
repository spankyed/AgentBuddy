import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { parseManifest, type PackManifest } from '@apackdev/sdk/build';
import { APP_ENVS, parseAppEnv, appDataDirFor, resolveAppContext, type AppEnv } from '@apackdev/sdk/env';

/** Data commands may default to the bundled CLI's channel; installed-app commands select production explicitly. */
export const defaultDataBuild = (): AppEnv => parseAppEnv(process.env.APACK_CLI_CHANNEL) ?? 'production';

/** Parse one explicit target. Repeated or conflicting selectors are errors. */
function parseSelection(args: string[], flag: string, allowed: readonly string[], fallback: AppEnv): { env: AppEnv; args: string[] } {
  const rest: string[] = [];
  let env: AppEnv | undefined;
  for (let i = 0; i < args.length; i++) {
    const [name, inline] = args[i]!.split(/=(.*)/s, 2);
    if (name !== flag) { rest.push(args[i]!); continue; }
    if (env !== undefined) throw new Error(`Specify ${flag} once.`);
    const value = inline ?? args[++i];
    if (!value || !allowed.includes(value)) throw new Error(`${flag} needs one of: ${allowed.join(', ')}`);
    env = value as AppEnv;
  }
  return { env: env ?? fallback, args: rest };
}

export const parseTargetEnv = (args: string[]) => parseSelection(args, '--data', APP_ENVS, defaultDataBuild());
export const parseReleaseChannel = (args: string[]) => parseSelection(args, '--channel', ['production', 'beta', 'preview'], 'production');

/** An explicit namespace uses its canonical storage; an unnamed target may honor a caller's data override. */
export function targetDataContext(env: AppEnv, args: string[]) {
  const named = args.some(arg => arg === '--data' || arg.startsWith('--data='));
  return resolveAppContext({ build: env, ...(named ? { profile: appDataDirFor(env) } : {}) });
}

export function envLabel(env: AppEnv): string {
  if (env === 'production') return '';
  return ` (${env})`;
}

export const TARGET_ENV_USAGE = '--data <name>  App data namespace: ' + APP_ENVS.join(', ');

/**
 * The pack at or above `from`, or undefined.
 *
 * Every command but one wants the throwing form below: they act on a pack, and having none is the end of
 * it. `npm run dev:drive --` is the exception — driving the app with no pack under test is a coherent thing to do,
 * and this is what lets it say so rather than treating it as a failure.
 */
export function findPackRootOrNone(from: string): string | undefined {
  let dir = from;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'apack.json'))) return dir;
    dir = path.dirname(dir);
  }
  return undefined;
}

export function findPackRoot(from: string): string {
  const root = findPackRootOrNone(from);
  if (root === undefined) throw new Error('No apack.json found. Run this command from inside a pack directory.');
  return root;
}

export function readManifest(root: string): PackManifest {
  return JSON.parse(fs.readFileSync(path.join(root, 'apack.json'), 'utf-8'));
}

/** The pack's manifest, or an error listing why the installer would reject it */
export function readValidManifest(root: string): PackManifest {
  const manifest = readManifest(root);
  const { errors } = parseManifest(manifest);
  if (errors.length > 0) {
    throw new Error(`apack.json is invalid:\n${errors.map(e => `  - ${e}`).join('\n')}`);
  }
  return manifest;
}

const cliRequire = createRequire(import.meta.url);

/** The @apackdev/sdk package this CLI runs against. */
export function sdkPackageDir(): string {
  return path.dirname(cliRequire.resolve('@apackdev/sdk/package.json'));
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
  return path.join(import.meta.dirname, '..', 'bin', 'apack.mjs');
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
