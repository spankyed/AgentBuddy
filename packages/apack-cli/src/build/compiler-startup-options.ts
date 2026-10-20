import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { formatNodeOptions, parseNodeOptions, withoutSourceCondition } from '@apackdev/host/build/source-resolution';

export const COMPILER_NODE_OPTIONS_ENV = 'APACK_COMPILER_NODE_OPTIONS';

export const compilerStartupLoader = (bootstrap: string) => pathToFileURL(path.join(path.dirname(bootstrap), '../bin/compiler-startup-loader.mjs')).href;

/** Observe an existing loader before its dependency graph is resolved; plain launches stay loader-free. */
export function compilerStartupArguments(bootstrap: string, args: readonly string[]): string[] {
  const loader = args.some(arg => /^--(?:experimental-)?loader(?:=|$)/.test(arg));
  return ['--require', bootstrap, ...(loader ? ['--experimental-loader', compilerStartupLoader(bootstrap)] : []), ...args];
}

/** Native capture precedes user preloads; children inherit user options without our private bootstrap. */
export function compilerStartupOptions(bin: string, nodeOptions: string | undefined) {
  const user = withoutSourceCondition(nodeOptions);
  return { user, worker: formatNodeOptions(compilerStartupArguments(
    path.join(path.dirname(bin), '../dist/compiler-startup.cjs'), parseNodeOptions(user))) };
}
