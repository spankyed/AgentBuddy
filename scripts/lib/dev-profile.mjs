import { createHash } from 'node:crypto';
import { realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { tsImport } from 'tsx/esm/api';

/** Linked worktrees get stable, separate storage; the main checkout keeps its development profile. */
/** @param {string} root */
export function checkoutProfile(root) {
  const canonical = realpathSync(root);
  if (statSync(path.join(canonical, '.git')).isDirectory()) return 'development';
  return `worktree-${createHash('sha256').update(canonical).digest('hex').slice(0, 16)}`;
}

/** Explicit profiles, fresh runs and storage overrides still take precedence. */
/** @param {string} root @param {string[]} args @param {NodeJS.ProcessEnv} env */
export function withCheckoutProfile(root, args, env = process.env) {
  if (env.APACK_USER_DATA_DIR || args.some(arg => /^--(?:profile|fresh|data-dir)(?:=|$)/.test(arg))) return args;
  return [...args, '--profile', checkoutProfile(root)];
}

/** The watch loop and repository driver use the CLI's same named-profile storage. */
/** @param {string} root */
export async function prepareCheckoutProfile(root) {
  if (process.env.APACK_USER_DATA_DIR) return;
  const name = checkoutProfile(root);
  if (name === 'development') return;
  const { openProfile } = await tsImport('../../packages/apack-cli/src/app/profiles.ts', import.meta.url);
  const { cliDirs } = await tsImport('../../packages/apack-cli/src/app/pack-host.ts', import.meta.url);
  const { dir } = openProfile(cliDirs(), name);
  process.env.APACK_USER_DATA_DIR = dir;
  process.env.APACK_SECRETS_VAULT = 'file';
  console.log(`[dev] profile ${name}: ${dir}`);
}
