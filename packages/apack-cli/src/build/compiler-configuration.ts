import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import ts from 'typescript';

export interface PackCompilerConfiguration {
  readonly options: ts.CompilerOptions;
  readonly files: ReadonlyMap<string, string>;
}

/** Resolve current configuration inheritance before compiling or hashing; never infer defaults from errors. */
export function readPackCompilerConfiguration(root: string): PackCompilerConfiguration | undefined {
  const config = path.join(root, 'tsconfig.json');
  if (!fs.existsSync(config)) return undefined;
  const files = new Map<string, string>();
  const diagnostics: ts.Diagnostic[] = [];
  const parsed = ts.getParsedCommandLineOfConfigFile(config, {}, {
    ...ts.sys,
    readFile(file) {
      const text = ts.sys.readFile(file);
      if (text !== undefined) files.set(path.resolve(file), text);
      return text;
    },
    onUnRecoverableConfigFileDiagnostic: diagnostic => diagnostics.push(diagnostic),
  });
  diagnostics.push(...(parsed?.errors ?? []));
  // Empty source sets are legitimate for metadata inspection and entry-driven declaration bundles.
  const errors = diagnostics.filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error && diagnostic.code !== 18003);
  if (errors.length || !parsed) throw new Error(`tsconfig.json could not be read: ${errors.map(diagnostic =>
    ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')).join('; ') || 'TypeScript returned no configuration'}`);
  return { options: parsed.options, files };
}

/** Include inherited/local/package configs even when they live outside the authored pack root. */
export function compilerConfigurationHash(root: string): string {
  const configuration = readPackCompilerConfiguration(root);
  const hash = createHash('sha256');
  if (!configuration) return hash.update('no tsconfig').digest('hex');
  const files = [...configuration.files].map(([file, text]) => [path.relative(root, file).split(path.sep).join('/'), text] as const);
  for (const [file, text] of files.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    hash.update(JSON.stringify([file, text]));
  }
  return hash.digest('hex');
}
