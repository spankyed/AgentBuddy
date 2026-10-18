import fs from 'node:fs';
import path from 'node:path';
import { createRequire, isBuiltin, type ResolveHookContext } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { relativeCompilerPath } from './compiler-paths.ts';
import type { CompilerFileReadInputs } from './compiler-file-reads.ts';

/** Record possible lookup inputs; Node retains module selection and its errors. */
export function observeCompilerModuleResolution(inputs: CompilerFileReadInputs, specifier: string,
  context: Pick<ResolveHookContext, 'parentURL' | 'conditions'> & { lookupPaths?: readonly string[] }): void {
  const parent = context.parentURL;
  if (!parent?.startsWith('file:') || isBuiltin(specifier)) return;
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
  const readDeclaration = (root: string): { name?: unknown; main?: unknown; imports?: unknown; exports?: unknown } | undefined => {
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
  // These are possible inputs, not a second resolver. Inspect all conditional/array candidates;
  // Node alone chooses a branch, validates mappings and reports resolution errors.
  const observeTarget = (target: unknown, root: string, imports: boolean, match?: string): void => {
    if (Array.isArray(target)) { for (const value of target) observeTarget(value, root, imports, match); return; }
    if (target && typeof target === 'object') {
      for (const value of Object.values(target)) observeTarget(value, root, imports, match);
      return;
    }
    if (typeof target !== 'string') return;
    const value = match === undefined ? target : target.replaceAll('*', match);
    if (value.startsWith('./')) {
      let file: string;
      try { file = fileURLToPath(new URL(value, pathToFileURL(root + path.sep))); }
      catch { return; }
      probeType(file);
    } else if (imports && !value.startsWith('#') && !value.startsWith('.') && !path.isAbsolute(value)) {
      observeCompilerModuleResolution(inputs, value, {
        parentURL: pathToFileURL(path.join(root, 'package.json')).href, conditions: ['import'],
      });
    }
  };
  const observeMapping = (mapping: unknown, key: string, root: string, imports = false) => {
    if (!imports && (typeof mapping === 'string' || Array.isArray(mapping)
      || (mapping && typeof mapping === 'object' && !Object.keys(mapping).some(name => name.startsWith('.'))))) {
      if (key === '.') observeTarget(mapping, root, false);
      return;
    }
    if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) return;
    if (Object.hasOwn(mapping, key)) { observeTarget(Reflect.get(mapping, key), root, imports); return; }
    for (const [pattern, target] of Object.entries(mapping)) {
      const star = pattern.indexOf('*');
      if (star === -1 || !key.startsWith(pattern.slice(0, star)) || !key.endsWith(pattern.slice(star + 1))
        || key.length < pattern.length - 1) continue;
      observeTarget(target, root, imports, key.slice(star, key.length - (pattern.length - star - 1)));
    }
  };
  const relative = specifier === '.' || specifier === '..' || /^\.\.?[\\/]/.test(specifier);
  // Native CJS imports/self-resolution bypass _findPath. Its outer observer supplies the real parent.
  if (context.lookupPaths === undefined && !relative && !path.isAbsolute(specifier) && !specifier.startsWith('file:')) {
    for (let root = directory; path.basename(root) !== 'node_modules'; root = path.dirname(root)) {
      const metadata = readDeclaration(root);
      if (probeType(path.join(root, 'package.json'))?.isFile()) {
        if (specifier.startsWith('#')) observeMapping(metadata?.imports, specifier, root, true);
        else if (typeof metadata?.name === 'string' && (specifier === metadata.name || specifier.startsWith(metadata.name + '/'))) {
          observeMapping(metadata.exports, '.' + specifier.slice(metadata.name.length), root);
        }
        break;
      }
      if (path.dirname(root) === root) break;
    }
  }
  if ((commonJS && context.lookupPaths === undefined) || specifier.startsWith('#')) return;
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
    observeMapping(metadata?.exports, '.' + specifier.slice(name.length), root);
    if (commonJS) {
      const target = path.resolve(lookup, specifier);
      probeCommonJS(target, target === root ? metadata : readDeclaration(target));
    }
  }
}
