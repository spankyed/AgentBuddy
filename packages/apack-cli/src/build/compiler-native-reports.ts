import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { threadId } from 'node:worker_threads';
import { assertNativeCompilerObservations, relativeCompilerPath, type CompilerInputObservations } from '@apackdev/host/build/compiler-inputs';
import type { CapturedNativeModule } from './compiler-native-input-owner.ts';

export const COMPILER_NATIVE_REPORT = /^native-inputs-\d+\.json$/;

interface CompilerNativeInputsReport {
  source: CompilerInputObservations;
  copies?: CompilerInputObservations;
  modules: CapturedNativeModule[];
}

/**
 * Reuse exact captured modules across threads of one compiler process, with checked copy integrity. A module is
 * loaded from the workspace's read tree or from the shared native store; a stored one is accepted only when its bytes
 * are the ones the build observed in the read tree file it was copied from.
 */
export function createCompilerNativeReports(sourceRoot: string, workspace: string, nativeStore: string) {
  const report = path.join(workspace, `native-inputs-${threadId}.json`);
  const absolute = (value: unknown): value is string => typeof value === 'string' && path.isAbsolute(value) && !value.includes('\0');
  const within = (directory: string, file: string) => {
    const relative = relativeCompilerPath(directory, file);
    return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  };
  const owned = (file: string) => within(workspace, file);
  const stored = (file: string) => within(nativeStore, file);
  /** Where a module's bytes may live: its copy in the read tree, or the store's copy of that */
  const placed = (module: CapturedNativeModule) => module.copy === undefined
    ? owned(module.captured) && owned(module.packageRoot)
    : absolute(module.copy) && owned(module.copy) && stored(module.captured) && stored(module.packageRoot);
  const observations = (value: unknown): value is CompilerInputObservations => {
    if (!value || typeof value !== 'object' || !('root' in value) || !absolute(value.root) || !('entries' in value)) return false;
    return Array.isArray(value.entries) && value.entries.every(entry => Array.isArray(entry) && entry.length === 2
      && typeof entry[0] === 'string' && typeof entry[1] === 'string');
  };
  const reports = (): CompilerNativeInputsReport[] => fs.readdirSync(workspace).filter(name => COMPILER_NATIVE_REPORT.test(name)).sort().map(name => {
    const file = path.join(workspace, name);
    try {
      const value = JSON.parse(fs.readFileSync(file, 'utf8')) as CompilerNativeInputsReport;
      if (!observations(value.source) || value.source.root !== sourceRoot
        || (value.copies !== undefined && (!observations(value.copies) || !owned(value.copies.root)))
        || !Array.isArray(value.modules) || !value.modules.every(module => module && absolute(module.source)
          && absolute(module.captured) && absolute(module.packageRoot) && placed(module))
        || (value.modules.length > 0 && !value.copies)) throw new Error('Invalid native input receipt');
      for (const module of value.modules) {
        const real = { captured: fs.realpathSync.native(module.captured), packageRoot: fs.realpathSync.native(module.packageRoot) };
        if (!placed({ ...module, ...real, copy: module.copy && fs.realpathSync.native(module.copy) })
          || !owned(fs.realpathSync.native(value.copies!.root))) throw new Error('Native capture resolves outside its workspace');
        const copy = module.copy === undefined ? real.captured : fs.realpathSync.native(module.copy);
        const observed = value.copies!.entries.find(([query, result]) => {
          const [kind, file] = JSON.parse(query);
          if (kind !== 'file' || typeof file !== 'string') return false;
          const hash: unknown = JSON.parse(result);
          return typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash)
            && relativeCompilerPath(copy, fs.realpathSync.native(path.resolve(value.copies!.root, file))) === '';
        });
        if (!observed) throw new Error(`Native module "${module.captured}" (${copy}) has no captured file observation in "${value.copies!.root}"`);
        if (module.copy !== undefined && createHash('sha256').update(fs.readFileSync(real.captured)).digest('hex') !== JSON.parse(observed[1])) {
          throw new Error(`Stored native module "${module.captured}" differs from the bytes captured at "${module.copy}"`);
        }
      }
      return value;
    } catch (error) { throw new Error(`Cannot read compiler native inputs: ${file}`, { cause: error }); }
  });
  let previous = '';
  return {
    read: reports,
    write(value: CompilerNativeInputsReport) {
      const contents = JSON.stringify(value);
      if (contents === previous) return;
      fs.writeFileSync(report + '.tmp', contents);
      fs.renameSync(report + '.tmp', report);
      previous = contents;
    },
    findModule(file: string) {
      for (const context of reports()) {
        const module = context.modules.find(module => relativeCompilerPath(module.source, file) === '');
        if (!module) continue;
        if (context.copies) assertNativeCompilerObservations(context.copies);
        return module;
      }
    },
  };
}
