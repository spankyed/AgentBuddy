import path from 'node:path';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { readPackCompilerConfiguration, type CompilerInputObserver } from './compiler-configuration.ts';
import { isPackInputPath, packInputFiles } from './pack-inputs.ts';

/** Resolve type inputs afresh, including imports outside the pack and undeclared npm packages. */
export function compilerModuleInputsHash(root: string, observe?: CompilerInputObserver): string {
  const configuration = readPackCompilerConfiguration(root, observe);
  const options = {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    ...configuration?.options, allowJs: true, noEmit: true,
  };
  const rootNames = packInputFiles(root, { modulesOnly: true })
    .filter(file => /\.[cm]?[jt]sx?$/.test(file)).map(file => path.join(root, file));
  const files = new Map(configuration?.files);
  const host = ts.createCompilerHost(options);
  // Generated imports are outputs of this calculation, not inputs to its next invocation.
  const excluded = (file: string) => {
    const relative = path.relative(root, file);
    return !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
      && !isPackInputPath(relative, false) && !relative.split(path.sep).includes('node_modules');
  };
  const { readFile, fileExists, getSourceFile, directoryExists, getDirectories } = host;
  host.readFile = file => {
    if (excluded(file)) return undefined;
    observe?.(file, 'file');
    const text = readFile(file);
    if (text !== undefined) files.set(path.resolve(file), text);
    return text;
  };
  host.fileExists = file => {
    if (excluded(file)) return false;
    observe?.(file, 'file');
    return fileExists(file);
  };
  host.directoryExists = directory => {
    observe?.(directory, 'directory');
    return directoryExists?.(directory) ?? false;
  };
  host.getDirectories = directory => {
    observe?.(directory, 'entries');
    return getDirectories?.(directory) ?? [];
  };
  host.getSourceFile = (file, version, onError, fresh) => excluded(file) ? undefined
    : getSourceFile(file, version, onError, fresh);
  const program = ts.createProgram({ rootNames, options, host });
  for (const source of program.getSourceFiles()) {
    observe?.(source.fileName, 'file');
    files.set(path.resolve(source.fileName), source.text);
  }
  const hash = createHash('sha256');
  for (const [file, text] of [...files].map(([file, text]) =>
    [path.relative(root, file).split(path.sep).join('/'), text] as const)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) hash.update(JSON.stringify([file, text]));
  return hash.digest('hex');
}
