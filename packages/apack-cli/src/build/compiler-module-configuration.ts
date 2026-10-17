import fs from 'node:fs';
import path from 'node:path';
import { parseTsconfig } from 'get-tsconfig';
import { esbuildTsconfig, type PackCompilerConfiguration } from './compiler-configuration.ts';
import type { CompilerReadTree } from './compiler-read-tree.ts';
import { physicalWatchPath } from '@apackdev/host/build/compiler-inputs';

/** Match logical source filenames while resolving inherited configuration and aliases from owned files. */
export function writeCompilerModuleConfiguration(configuration: PackCompilerConfiguration | undefined,
  tree: CompilerReadTree): string | undefined {
  const file = configuration?.options.configFilePath;
  if (!configuration || typeof file !== 'string') return;
  const input = physicalWatchPath(tree.path(file));
  const config = parseTsconfig(input);
  const pattern = (value: string) => {
    const source = tree.sourcePath(path.resolve(path.dirname(input), value));
    return tree.sourcePath(physicalWatchPath(tree.path(source)));
  };
  const include = config.include ?? (config.files ? undefined : ['**/*']);
  config.files = config.files?.map(pattern);
  config.include = include?.map(pattern);
  config.exclude = config.exclude?.map(pattern);
  const resolution = esbuildTsconfig(configuration, tree.path).compilerOptions;
  config.compilerOptions = { ...config.compilerOptions,
    ...(resolution?.baseUrl !== undefined && { baseUrl: resolution.baseUrl }),
    ...(resolution?.paths !== undefined && { paths: resolution.paths }),
  };
  const output = path.join(tree.workDirectory, 'content-tsconfig.json');
  fs.writeFileSync(output, JSON.stringify(config));
  return output;
}
