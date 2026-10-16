import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { readPackCompilerConfiguration, type PackCompilerConfiguration } from './compiler-configuration.ts';
import type { BuildInputObserver } from '@apackdev/host/build/pack-inputs';
import { isPackInputPath, packInputFiles } from '@apackdev/host/build/pack-inputs';
import { codeBlocks } from './pack-sources.ts';
import { compilerSourcePath } from './compiler-paths.ts';
import { compilerGlobDirectories } from './compiler-source-globs.ts';
import { createCompilerFileView } from './compiler-file-view.ts';
import { readCompilerInstallationInputs } from './compiler-installation.ts';

/** Resolve script/type inputs afresh, including Vue scripts, outside imports and undeclared npm packages. */
export function readCompilerModuleInputs(root: string, observe?: BuildInputObserver): {
  hash: string;
  packageDirectories: string[];
  configuration: PackCompilerConfiguration | undefined;
  declarationConfiguration: PackCompilerConfiguration | undefined;
  readBytes(file: string): Buffer | undefined;
  captureFile: ReturnType<typeof createCompilerFileView>['captureFile'];
  captureLocation: ReturnType<typeof createCompilerFileView>['captureLocation'];
  readDirectoryData: ReturnType<typeof createCompilerFileView>['readDirectoryData'];
  readDataBytes: ReturnType<typeof createCompilerFileView>['readDataBytes'];
  readMetadata: ReturnType<typeof createCompilerFileView>['readMetadata'];
  resolutionDirectory: ReturnType<typeof createCompilerFileView>['resolutionDirectory'];
  fileSystem: ReturnType<typeof createCompilerFileView>['fileSystem'];
  ancestors: ReturnType<typeof createCompilerFileView>['ancestors'];
  snapshot: ReturnType<typeof createCompilerFileView>['snapshot'];
  assertCurrent(): void;
} {
  const realRoot = fs.realpathSync(root);
  const compilerPaths = readCompilerInstallationInputs()?.paths ?? [];
  const sourceRoot = compilerSourcePath(realRoot, compilerPaths);
  const authoredRoots = [...new Set([path.resolve(root), realRoot])];
  // Generated imports are outputs of this calculation, not inputs to its next invocation.
  const excluded = (file: string) => authoredRoots.some(directory => {
    const relative = path.relative(directory, file);
    return !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
      && !isPackInputPath(relative, false) && !relative.split(path.sep).includes('node_modules');
  });
  const relative = (file: string) => path.relative(sourceRoot, compilerSourcePath(file, compilerPaths)).split(path.sep).join('/');
  const view = createCompilerFileView(root, { paths: compilerPaths, excluded, observe });
  const fileSystem = view.fileSystem;
  const configuration = readPackCompilerConfiguration(root, { ...ts.sys, ...fileSystem });
  const declarationConfigPath = configuration ? undefined : ts.findConfigFile(root, fileSystem.fileExists);
  const declarationConfiguration = configuration ?? (declarationConfigPath
    ? readPackCompilerConfiguration(path.dirname(declarationConfigPath), { ...ts.sys, ...fileSystem }) : undefined);
  const options = {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    ...declarationConfiguration?.options, allowJs: true, noEmit: true,
  };
  const scripts = new Map<string, string>();
  const rootNames: string[] = [];
  const rootFiles = packInputFiles(root);
  for (const relative of rootFiles) {
    const file = path.join(root, relative);
    view.readBytes(file);
    if (/\.[cm]?[jt]sx?$/.test(file)) rootNames.push(file);
    if (!file.endsWith('.vue')) continue;
    const code = fileSystem.readFile(file);
    if (code === undefined) throw new Error(`Compiler source could not be read: ${file}`);
    const component = fileSystem.realpath(file);
    for (const [index, block] of codeBlocks(file, code).entries()) {
      const extension = block.lang === 'ts' || block.lang === 'tsx' || block.lang === 'jsx' ? block.lang : 'js';
      let virtual = `${component}.__script${index}.${extension}`;
      while (fileSystem.fileExists(virtual)) virtual += `.${extension}`;
      // A same-directory virtual root lets TypeScript follow imports with the component's resolution
      // context. It is never written to disk and is not a replacement for Vue's component typechecker.
      scripts.set(virtual, block.src ? `import ${JSON.stringify(block.src)};` : block.content);
      rootNames.push(virtual);
    }
  }
  const packages = new Set<string>();
  const packageCandidates = new Set<string>();
  const packageOf = (file: string) => {
    const parts = path.resolve(file).split(path.sep);
    const modules = parts.lastIndexOf('node_modules');
    if (modules < 0 || !parts[modules + 1]) return;
    const directory = parts.slice(0, modules + (parts[modules + 1]!.startsWith('@') ? 3 : 2)).join(path.sep);
    if (packageCandidates.has(directory)) return;
    packageCandidates.add(directory);
    if (fileSystem.directoryExists(directory)) packages.add(fileSystem.realpath(directory));
  };
  for (const file of declarationConfiguration?.files.keys() ?? []) packageOf(file);
  const host = ts.createCompilerHost(options);
  const { getSourceFile } = host;
  host.readFile = file => {
    const script = scripts.get(path.resolve(file));
    if (script !== undefined) return script;
    if (excluded(file)) return undefined;
    const text = fileSystem.readFile(file);
    if (text !== undefined) packageOf(file);
    return text;
  };
  host.fileExists = file => {
    if (scripts.has(path.resolve(file))) return true;
    if (excluded(file)) return false;
    return fileSystem.fileExists(file);
  };
  host.directoryExists = fileSystem.directoryExists;
  host.getDirectories = fileSystem.getDirectories;
  host.realpath = fileSystem.realpath;
  host.readDirectory = fileSystem.readDirectory;
  host.getSourceFile = (file, version, onError, fresh) => {
    const script = scripts.get(path.resolve(file));
    if (script !== undefined) return ts.createSourceFile(file, script, version, true);
    return excluded(file) ? undefined : getSourceFile(file, version, onError, fresh);
  };
  const program = ts.createProgram({ rootNames, options, host });
  const globDirectories = new Set<string>();
  function captureGlobDirectory(directory: string) {
    const physical = fileSystem.realpath(directory);
    if (globDirectories.has(physical)) return;
    globDirectories.add(physical);
    view.resolutionDirectory(directory);
    for (const name of fileSystem.getDirectories(directory)) captureGlobDirectory(path.join(directory, name));
  }
  for (const source of program.getSourceFiles()) {
    if (scripts.has(path.resolve(source.fileName))) continue;
    packageOf(source.fileName);
    for (const directory of compilerGlobDirectories(source)) captureGlobDirectory(directory);
  }
  const hash = createHash('sha256').update(JSON.stringify(rootFiles)).update(view.hash());
  const assertCurrent = () => {
    view.assertCurrent();
    if (JSON.stringify(packInputFiles(root)) !== JSON.stringify(rootFiles)) {
      throw new Error('Compiler source membership changed during discovery');
    }
  };
  assertCurrent();
  return { hash: hash.digest('hex'), configuration, declarationConfiguration, readBytes: view.readBytes, captureFile: view.captureFile,
    captureLocation: view.captureLocation, readDirectoryData: view.readDirectoryData, readDataBytes: view.readDataBytes, readMetadata: view.readMetadata, resolutionDirectory: view.resolutionDirectory, ancestors: view.ancestors, fileSystem, snapshot: view.snapshot,
    packageDirectories: [...packages].sort((a, b) => relative(a) < relative(b) ? -1 : relative(a) > relative(b) ? 1 : 0), assertCurrent };

}
