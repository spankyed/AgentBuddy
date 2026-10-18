import fs from 'node:fs';
import path from 'node:path';
import { createRequire, isBuiltin, type ResolveHookContext } from 'node:module';
import { fileURLToPath } from 'node:url';
import { relativeCompilerPath } from './compiler-paths.ts';
import type { CompilerFileReadInputs } from './compiler-file-reads.ts';

/** Record possible lookup inputs; Node retains module selection and its errors. */
export function observeCompilerModuleResolution(inputs: CompilerFileReadInputs, specifier: string,
  context: Pick<ResolveHookContext, 'parentURL' | 'conditions'> & { lookupPaths?: readonly string[] }): void {
  const parent = context.parentURL;
  if (!parent?.startsWith('file:') || isBuiltin(specifier) || specifier.startsWith('#')) return;
  const parentFile = fileURLToPath(parent);
  if (context.lookupPaths === undefined && !inputs.isInput(parentFile)) return;
  const directory = parentFile.endsWith(path.sep) ? parentFile : path.dirname(parentFile);
  const require = createRequire(parent);
  const commonJS = Array.from(context.conditions).includes('require');
  if (!commonJS && !path.isAbsolute(specifier) && /^[a-z][\w+.-]*:/i.test(specifier)
    && !specifier.startsWith('file:')) return;
  const extensions = Object.keys(require.extensions);
  const probeType = (file: string) => {
    if (!inputs.isInput(file)) return;
    const stat = inputs.readMetadata('stat', file, [{ throwIfNoEntry: false }]) as fs.Stats | undefined;
    if (stat) inputs.readMetadata('realpathNative', file, []);
    // The metadata view records the classification fields used by native lookup.
    stat?.isFile();
    stat?.isDirectory();
    return stat;
  };
  const probeFile = (target: string) => {
    probeType(target);
    for (const extension of extensions) probeType(target + extension);
  };
  const readDeclaration = (root: string): { main?: unknown } | undefined => {
    const stat = probeType(root);
    if (stat && !stat.isDirectory()) return;
    const file = path.join(root, 'package.json');
    if (!inputs.isInput(file)) return;
    const captured = inputs.readDataPath(file);
    try { return JSON.parse(fs.readFileSync(captured, 'utf8')); }
    catch (error) {
      // The resolver owns invalid declarations and absent-package diagnostics.
      if (!(error instanceof SyntaxError) && !['ENOENT', 'ENOTDIR', 'EISDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
    }
  };
  const probeCommonJS = (target: string, metadata: { main?: unknown } | undefined) => {
    probeFile(target);
    if (!probeType(target)?.isDirectory()) return;
    probeFile(path.join(target, 'index'));
    if (typeof metadata?.main === 'string') {
      const main = path.resolve(target, metadata.main);
      probeFile(main); probeFile(path.join(main, 'index'));
    }
  };
  const relative = specifier === '.' || specifier === '..' || /^\.\.?[\\/]/.test(specifier);
  if (relative || path.isAbsolute(specifier) || (!commonJS && specifier.startsWith('file:'))) {
    if (commonJS) {
      for (const base of context.lookupPaths ?? [directory]) {
        const target = path.resolve(base, specifier);
        probeCommonJS(target, readDeclaration(target));
      }
    } else {
      let target: string;
      try { target = fileURLToPath(new URL(specifier, parent)); }
      catch { return; }
      probeType(target);
    }
    return;
  }
  const name = specifier.split('/').slice(0, specifier.startsWith('@') ? 2 : 1).join('/');
  if (!name.split('/').every(part => part && part !== '.' && part !== '..')) return;
  for (const lookup of context.lookupPaths ?? require.resolve.paths(specifier) ?? []) {
    if (!commonJS) {
      const relative = relativeCompilerPath(path.dirname(lookup), directory);
      if (path.basename(lookup) !== 'node_modules' || relative === '..'
        || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) continue;
    }
    const root = path.resolve(lookup, name);
    const metadata = readDeclaration(root);
    if (commonJS) {
      const target = path.resolve(lookup, specifier);
      probeCommonJS(target, target === root ? metadata : readDeclaration(target));
    }
  }
}
