import path from 'node:path';
import { isBuiltin, registerHooks, type ModuleHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { CompilationInputs } from './compilation-inputs.ts';
import { withoutCompilerFileReads } from './compiler-file-reads.ts';

/** Keep native resolution inside this build's owned module namespace. */
export function createCompilerModuleLoader(compilation: CompilationInputs) {
  let hooks: ModuleHooks | undefined;
  let closed = false;
  function initialize() {
    if (hooks) return;
    const tree = compilation.readTree();
    const root = pathToFileURL(`${tree.directory}${path.sep}`).href;
    hooks = registerHooks({
      resolve(specifier, context, next) {
        if (isBuiltin(specifier) || (!context.parentURL?.startsWith(root) && !specifier.startsWith(root))) {
          return next(specifier, context);
        }
        return withoutCompilerFileReads(() => {
          if (!path.isAbsolute(specifier) && /^[a-z][\w+.-]*:/i.test(specifier) && !specifier.startsWith('file:')) return next(specifier, context);
          const url = specifier.startsWith('file:') ? new URL(specifier)
            : path.isAbsolute(specifier) && !Array.from(context.conditions).includes('require')
              ? new URL(specifier, context.parentURL) : undefined;
          const target = url ? fileURLToPath(url) : specifier;
          const source = path.isAbsolute(target) ? compilation.sourcePath(target) : target;
          const parent = context.parentURL?.startsWith('file:') ? fileURLToPath(context.parentURL) : source;
          compilation.prepareNative(source, path.dirname(compilation.sourcePath(parent)));
          if (!path.isAbsolute(target)) return next(specifier, context);
          const owned = pathToFileURL(tree.path(source));
          if (url) { owned.search = url.search; owned.hash = url.hash; }
          return next(url ? owned.href : fileURLToPath(owned), context);
        });
      },
    });
  }
  return {
    async importModule(file: string): Promise<Record<string, unknown>> {
      if (closed) throw new Error('Compiler module load outlived its build');
      const input = withoutCompilerFileReads(() => {
        compilation.prepareNative(file, path.dirname(file));
        initialize();
        const tree = compilation.readTree();
        const config = (compilation.configuration ?? compilation.declarationConfiguration)?.options.configFilePath;
        return { file: tree.path(file), tsconfig: typeof config === 'string' ? tree.path(config) : undefined };
      });
      const { tsImport } = await withoutCompilerFileReads(() => import('tsx/esm/api'));
      return tsImport(input.file, { parentURL: import.meta.url, tsconfig: input.tsconfig }) as Promise<Record<string, unknown>>;
    },
    dispose() { closed = true; hooks?.deregister(); },
  };
}
