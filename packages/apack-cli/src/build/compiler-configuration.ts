import path from 'node:path';
import ts from 'typescript';

export interface PackCompilerConfiguration {
  readonly options: ts.CompilerOptions;
  readonly files: ReadonlyMap<string, string>;
}


/** Resolve current configuration inheritance before compiling or hashing; never infer defaults from errors. */
export function readPackCompilerConfiguration(root: string, fileSystem = ts.sys): PackCompilerConfiguration | undefined {
  const config = path.join(root, 'tsconfig.json');
  if (!fileSystem.fileExists(config)) return undefined;
  const files = new Map<string, string>();
  const diagnostics: ts.Diagnostic[] = [];
  const parsed = ts.getParsedCommandLineOfConfigFile(config, {}, {
    ...fileSystem,
    readFile(file) {
      const text = fileSystem.readFile(file);
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
