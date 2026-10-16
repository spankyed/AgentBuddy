import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import type { BuildInputObserver } from '@apackdev/host/build/pack-inputs';

export interface PackCompilerConfiguration {
  readonly options: ts.CompilerOptions;
  readonly files: ReadonlyMap<string, string>;
}


/** Resolve current configuration inheritance before compiling or hashing; never infer defaults from errors. */
export function readPackCompilerConfiguration(root: string, observe?: BuildInputObserver): PackCompilerConfiguration | undefined {
  const config = path.join(root, 'tsconfig.json');
  observe?.(config, 'file');
  if (!fs.existsSync(config)) return undefined;
  const files = new Map<string, string>();
  const diagnostics: ts.Diagnostic[] = [];
  const parsed = ts.getParsedCommandLineOfConfigFile(config, {}, {
    ...ts.sys,
    readFile(file) {
      observe?.(file, 'file');
      const text = ts.sys.readFile(file);
      if (text !== undefined) files.set(path.resolve(file), text);
      return text;
    },
    fileExists(file) { observe?.(file, 'file'); return ts.sys.fileExists(file); },
    directoryExists(directory) { observe?.(directory, 'directory'); return ts.sys.directoryExists(directory); },
    onUnRecoverableConfigFileDiagnostic: diagnostic => diagnostics.push(diagnostic),
  });
  diagnostics.push(...(parsed?.errors ?? []));
  // Empty source sets are legitimate for metadata inspection and entry-driven declaration bundles.
  const errors = diagnostics.filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error && diagnostic.code !== 18003);
  if (errors.length || !parsed) throw new Error(`tsconfig.json could not be read: ${errors.map(diagnostic =>
    ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')).join('; ') || 'TypeScript returned no configuration'}`);
  return { options: parsed.options, files };
}
