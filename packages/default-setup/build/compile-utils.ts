import * as path from 'path';

// Re-export SDK types and the legacy wrapper
export type { CompileConfig, CompiledEntry, CompileResult } from '@abuddy/sdk/build';
export { compileAllSourceFiles as compileAllSourceFilesRaw, compileSourceDir, sourceHash, bundleFile } from '@abuddy/sdk/build';

// Legacy wrapper that resolves paths relative to default-setup root
import { compileAllSourceFiles as sdkCompile } from '@abuddy/sdk/build';
import type { CompileConfig } from '@abuddy/sdk/build';

export async function compileAllSourceFiles(config: CompileConfig): Promise<void> {
  const baseDir = path.resolve(import.meta.dirname, '..');
  await sdkCompile({
    ...config,
    sourceDir: path.join(baseDir, config.sourceDir),
    outputFile: path.join(baseDir, config.outputFile),
  });
}
