import { createHash } from 'node:crypto';
import { buildToolHash, cliPackageDirectory } from './tool-identity.ts';
import { packageInputsHash } from './package-inputs.ts';
import { SOURCE_CONDITION } from '@apackdev/host/build/source-resolution';
import { readCompilerModuleInputs } from './compiler-module-inputs.ts';

/** Instrumentation flags do not change compilation. The reserved source mode is in buildToolHash. */
export function compilationConditions(args = process.execArgv, nodeOptions = process.env.NODE_OPTIONS ?? ''): string[] {
  const tokens = nodeOptions.match(/(?:[^\s"'\\]|\\.|"(?:[^"\\]|\\.)*"|'[^']*')+/g) ?? [];
  const options = [...args, ...tokens.map(token => token.replace(/["']/g, '').replace(/\\(.)/g, '$1'))];
  const conditions = new Set<string>();
  for (let i = 0; i < options.length; i++) {
    const option = options[i]!;
    let condition: string | undefined;
    if (option.startsWith('--conditions=') || option.startsWith('-C=')) condition = option.slice(option.indexOf('=') + 1);
    else if (option === '--conditions' || option === '-C') condition = options[++i];
    if (condition && condition !== SOURCE_CONDITION) conditions.add(condition);
  }
  return [...conditions].sort();
}

export interface CompilationInputs {
  readonly hash: string;
  assertCurrent(): void;
}

/** One live-byte scope per build, shared by phases; recomputed at publication, never cached across builds. */
export function captureCompilationInputs(packRoot: string): CompilationInputs {
  const cliRoot = cliPackageDirectory();
  const current = () => {
    const modules = readCompilerModuleInputs(packRoot);
    return createHash('sha256').update(buildToolHash()).update(packageInputsHash([
      { id: 'cli', directory: cliRoot }, { id: 'pack', directory: packRoot, development: true },
    ], modules.packageDirectories)).update(modules.hash)
      .update(JSON.stringify([process.versions.node, process.platform, process.arch, compilationConditions()]))
      .digest('hex');
  };
  const hash = current();
  return { hash, assertCurrent() {
    if (current() !== hash) throw new Error('Compiler or installed package inputs changed; retry before publishing');
  } };
}
