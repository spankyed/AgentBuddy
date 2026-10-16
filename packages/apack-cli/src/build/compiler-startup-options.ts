import path from 'node:path';
import { formatNodeOptions, parseNodeOptions, withoutSourceCondition } from '@apackdev/host/build/source-resolution';

export const COMPILER_NODE_OPTIONS_ENV = 'APACK_COMPILER_NODE_OPTIONS';

/** Native capture precedes user preloads; children inherit user options without our private bootstrap. */
export function compilerStartupOptions(bin: string, nodeOptions: string | undefined) {
  const user = withoutSourceCondition(nodeOptions);
  return { user, worker: formatNodeOptions([
    '--require', path.join(path.dirname(bin), '../dist/compiler-startup.cjs'),
    ...parseNodeOptions(user),
  ]) };
}
