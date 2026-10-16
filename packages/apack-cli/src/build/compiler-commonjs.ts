import path from 'node:path';
import { createRequire } from 'node:module';
import { transformSync, type Loader } from 'esbuild';
import type { CompilationInputs } from './compilation-inputs.ts';
import { esbuildTsconfig } from './compiler-configuration.ts';
import { withoutCompilerFileReads } from './compiler-file-reads.ts';

/** tsx's CommonJS API has no per-registration config. Transform only this build's owned modules. */
export function registerCompilerCommonJS(compilation: CompilationInputs, directory: string): () => void {
  const require = createRequire(import.meta.url);
  const extensions = require.extensions;
  const module = require('node:module') as { _resolveFilename(request: string, parent: NodeJS.Module | undefined, ...args: unknown[]): string };
  const nativeResolve = module._resolveFilename;
  const owns = (file: string | undefined) => {
    if (!file || !path.isAbsolute(file)) return false;
    const relative = path.relative(directory, file.split('?')[0]!);
    return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  };
  let inputs: CompilationInputs | undefined = compilation;
  const loaders: Record<string, Loader> = { '.js': 'js', '.cjs': 'js', '.ts': 'ts', '.cts': 'ts', '.tsx': 'tsx', '.jsx': 'jsx' };
  const restore: Array<() => void> = [];
  let enabled = true;
  // Native lookup must retain owned filenames; source-path projection belongs to compiler code.
  const resolve: typeof nativeResolve = function(this: typeof module, request, parent, ...args) {
    const run = () => nativeResolve.call(this, request, parent, ...args);
    return enabled && (owns(request) || owns(parent?.filename)) ? withoutCompilerFileReads(run) : run();
  };
  module._resolveFilename = resolve;
  restore.push(() => { if (module._resolveFilename === resolve) module._resolveFilename = nativeResolve; });
  for (const extension of Object.keys(loaders)) {
    const previous = extensions[extension];
    const fallback = previous ?? extensions['.js']!;
    const load: NodeJS.RequireExtensions[string] = (module, filename) => {
      const file = filename.split('?')[0]!;
      const relative = path.relative(directory, file);
      const compilation = inputs;
      if (!compilation || !enabled || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return fallback(module, filename);
      const code = withoutCompilerFileReads(() => {
        const source = compilation.sourcePath(file);
        const bytes = compilation.readFile(source);
        if (!bytes) throw new Error(`Missing captured compiler module: ${source}`);
        const configuration = compilation.configuration ?? compilation.declarationConfiguration;
        const result = transformSync(bytes.toString('utf8'), { loader: loaders[path.extname(file)] ?? 'js', format: 'cjs', platform: 'node',
          sourcefile: source, sourcemap: 'inline',
          ...(configuration && { tsconfigRaw: esbuildTsconfig(configuration, compilation.readTree().path) }) });
        return result.code;
      });
      (module as NodeJS.Module & { _compile(code: string, filename: string): void })._compile(code, file);
    };
    extensions[extension] = load;
    restore.push(() => {
      if (extensions[extension] !== load) return;
      if (previous) extensions[extension] = previous;
      else delete extensions[extension];
    });
  }
  return () => { enabled = false; inputs = undefined; for (const reset of restore.reverse()) reset(); };
}
