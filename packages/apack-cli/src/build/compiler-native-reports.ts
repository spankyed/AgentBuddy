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

/** Reuse exact captured modules across threads of one compiler process, with checked copy integrity. */
export function createCompilerNativeReports(sourceRoot: string, workspace: string) {
  const report = path.join(workspace, `native-inputs-${threadId}.json`);
  const absolute = (value: unknown): value is string => typeof value === 'string' && path.isAbsolute(value) && !value.includes('\0');
  const owned = (file: string) => {
    const relative = relativeCompilerPath(workspace, file);
    return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  };
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
          && absolute(module.captured) && owned(module.captured) && absolute(module.packageRoot) && owned(module.packageRoot))
        || (value.modules.length > 0 && !value.copies)) throw new Error('Invalid native input receipt');
      for (const module of value.modules) {
        if (!value.copies!.entries.some(([query, result]) => {
          const [kind, file] = JSON.parse(query);
          if (kind !== 'file' || typeof file !== 'string') return false;
          const hash: unknown = JSON.parse(result);
          return typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash)
            && relativeCompilerPath(module.captured, path.resolve(value.copies!.root, file)) === '';
        })) throw new Error('Native module has no captured file observation');
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
