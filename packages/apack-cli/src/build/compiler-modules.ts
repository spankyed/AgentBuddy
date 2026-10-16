import path from 'node:path';
import type { CompilationInputs } from './compilation-inputs.ts';
import { withoutCompilerFileReads } from './compiler-file-reads.ts';

/** Execute content compiler entrypoints from the same owned namespace as the other build phases. */
export async function importCompilerModule(file: string, compilation: CompilationInputs): Promise<Record<string, unknown>> {
  const input = withoutCompilerFileReads(() => {
    compilation.prepareNative(file, path.dirname(file));
    const tree = compilation.readTree();
    const config = (compilation.configuration ?? compilation.declarationConfiguration)?.options.configFilePath;
    return { file: tree.path(file), tsconfig: typeof config === 'string' ? tree.path(config) : undefined };
  });
  const { tsImport } = await withoutCompilerFileReads(() => import('tsx/esm/api'));
  return tsImport(input.file, { parentURL: import.meta.url, tsconfig: input.tsconfig }) as Promise<Record<string, unknown>>;
}
