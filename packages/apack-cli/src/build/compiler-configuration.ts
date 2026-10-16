import path from 'node:path';
import ts from 'typescript';
import type { TsconfigRaw } from 'esbuild';

export interface PackCompilerConfiguration {
  readonly options: ts.CompilerOptions;
  readonly files: ReadonlyMap<string, string>;
  readonly rootFiles: readonly string[];
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
  return { options: parsed.options, files, rootFiles: parsed.fileNames };
}

/** esbuild's supported options from the same resolved configuration the input view consumed. */
export function esbuildTsconfig({ options }: PackCompilerConfiguration, resolveInputPath: (file: string) => string = file => file): TsconfigRaw {
  const jsx: Record<number, NonNullable<TsconfigRaw['compilerOptions']>['jsx']> = {
    [ts.JsxEmit.Preserve]: 'preserve', [ts.JsxEmit.React]: 'react', [ts.JsxEmit.ReactNative]: 'react-native',
    [ts.JsxEmit.ReactJSX]: 'react-jsx', [ts.JsxEmit.ReactJSXDev]: 'react-jsxdev',
  };
  const imports = {
    [ts.ImportsNotUsedAsValues.Remove]: 'remove', [ts.ImportsNotUsedAsValues.Preserve]: 'preserve',
    [ts.ImportsNotUsedAsValues.Error]: 'error',
  } as const;
  // Keep every option in esbuild's declared contract accounted for when upgrading the compiler.
  const compilerOptions = {
    alwaysStrict: options.alwaysStrict,
    strict: options.strict,
    experimentalDecorators: options.experimentalDecorators,
    jsx: options.jsx === undefined ? undefined : jsx[options.jsx],
    jsxFactory: options.jsxFactory,
    jsxFragmentFactory: options.jsxFragmentFactory,
    jsxImportSource: options.jsxImportSource,
    target: options.target === undefined ? undefined : options.target === ts.ScriptTarget.ESNext ? 'esnext' : ts.ScriptTarget[options.target]?.toLowerCase(),
    useDefineForClassFields: options.useDefineForClassFields,
    verbatimModuleSyntax: options.verbatimModuleSyntax,
    importsNotUsedAsValues: options.importsNotUsedAsValues === undefined ? undefined : imports[options.importsNotUsedAsValues],
    preserveValueImports: options.preserveValueImports,
    baseUrl: options.baseUrl === undefined ? undefined : resolveInputPath(options.baseUrl),
    paths: compilerAliasPaths(options, resolveInputPath),
  } satisfies Record<keyof NonNullable<TsconfigRaw['compilerOptions']>, unknown>;
  return { compilerOptions };
}

function compilerAliasPaths(options: ts.CompilerOptions, resolveInputPath: (file: string) => string): Record<string, string[]> | undefined {
  if (!options.paths) return;
  // TypeScript records the declaring directory here when paths has no baseUrl. Adding baseUrl would
  // also change unrelated bare imports, so resolve targets without inventing one.
  const base = options.baseUrl ?? options.pathsBasePath;
  if (typeof base !== 'string') throw new Error('Missing declaring directory for tsconfig paths');
  return Object.fromEntries(Object.entries(options.paths)
    .map(([name, targets]) => [name, targets.map(target => resolveInputPath(path.resolve(base, target)))]));
}

/** Project TypeScript's file locations while retaining semantic compiler options. */
export function compilerReadOptions(options: ts.CompilerOptions, resolveInputPath: (file: string) => string): ts.CompilerOptions {
  const result = { ...options };
  for (const key of ['baseUrl', 'rootDir', 'outDir', 'declarationDir', 'outFile', 'tsBuildInfoFile'] as const) {
    if (options[key] !== undefined) result[key] = resolveInputPath(options[key]);
  }
  for (const key of ['rootDirs', 'typeRoots'] as const) {
    if (options[key]) result[key] = options[key].map(resolveInputPath);
  }
  if (options.paths) result.paths = compilerAliasPaths(options, resolveInputPath);
  for (const key of ['configFilePath', 'pathsBasePath']) {
    if (typeof options[key] === 'string') result[key] = resolveInputPath(options[key]);
  }
  return result;
}
