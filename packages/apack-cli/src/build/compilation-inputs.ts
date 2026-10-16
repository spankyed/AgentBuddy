import { createHash } from 'node:crypto';
import { errorMessage } from '@apackdev/sdk/utils/pure';
import { buildToolHash, cliPackageDirectory } from './tool-identity.ts';
import { readPackageInputs } from '@apackdev/host/build/package-inputs';
import { SOURCE_CONDITION } from '@apackdev/host/build/source-resolution';
import { readCompilerModuleInputs } from './compiler-module-inputs.ts';
import { readCompilerInstallationInputs } from './compiler-installation.ts';
import type { PackCompilerConfiguration } from './compiler-configuration.ts';
import fs from 'node:fs';
import path from 'node:path';
import { packInputFiles } from '@apackdev/host/build/pack-inputs';

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
  readonly configuration: PackCompilerConfiguration | undefined;
  readFile(file: string): Buffer | undefined;
  captureGenerated(): void;
  assertCurrent(): void;
}

/** Own one module read-set per build; recheck its data and package/tool inputs without rerunning TypeScript. */
export function captureCompilationInputs(packRoot: string): CompilationInputs {
  const cliRoot = cliPackageDirectory();
  const compiler = readCompilerInstallationInputs();
  if (compiler && !compiler.packages.includes(cliRoot)) throw new Error('Captured compiler inputs do not belong to this CLI');
  const capturedPackages = new Set(compiler?.packages);
  const modules = readCompilerModuleInputs(packRoot);
  const current = (capture = false) => {
    const owners = [{ id: 'pack', directory: packRoot, development: true }];
    if (!compiler) owners.unshift({ id: 'cli', directory: cliRoot, development: false });
    return createHash('sha256').update(compiler?.hash ?? buildToolHash()).update(readPackageInputs(owners, {
      discovered: modules.packageDirectories.filter(directory => !capturedPackages.has(directory)),
      onFile: capture ? (file, bytes) => modules.captureFile(file.source, bytes) : undefined,
    }).hash).update(modules.hash)
      .update(JSON.stringify([process.versions.node, process.platform, process.arch, compilationConditions()]))
      .digest('hex');
  };
  const hash = current(true);
  return {
    hash,
    configuration: modules.configuration,
    readFile: modules.readBytes,
    captureGenerated() {
      for (const relative of packInputFiles(packRoot, { generated: true })) {
        if (!relative.startsWith('src/__generated__/')) continue;
        const file = path.join(packRoot, relative);
        modules.captureFile(file, fs.readFileSync(file));
      }
    },
    assertCurrent() {
      try {
        modules.assertCurrent();
        if (current() !== hash) throw new Error('Implementation, package or execution options differ');
      } catch (cause) {
        throw new Error(`Compiler or installed package inputs changed; retry before publishing: ${errorMessage(cause)}`, { cause });
      }
    },
  };
}
