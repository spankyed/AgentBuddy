import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { readPackCompilerConfiguration, type CompilerInputObserver } from './compiler-configuration.ts';
import { isPackInputPath, packInputFiles } from '@apackdev/host/build/pack-inputs';
import { codeBlocks } from './pack-sources.ts';

/** Resolve script/type inputs afresh, including Vue scripts, outside imports and undeclared npm packages. */
export function readCompilerModuleInputs(root: string, observe?: CompilerInputObserver): { hash: string; packageDirectories: string[] } {
  const realRoot = fs.realpathSync(root);
  const authoredRoots = [...new Set([path.resolve(root), realRoot])];
  const configuration = readPackCompilerConfiguration(root, observe);
  const options = {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    ...configuration?.options, allowJs: true, noEmit: true,
  };
  const files = new Map(configuration?.files);
  const scripts = new Map<string, string>();
  const rootNames: string[] = [];
  for (const relative of packInputFiles(root, { modulesOnly: true })) {
    const file = path.join(root, relative);
    if (/\.[cm]?[jt]sx?$/.test(file)) rootNames.push(file);
    if (!file.endsWith('.vue')) continue;
    observe?.(file, 'file');
    const component = fs.realpathSync(file);
    if (component !== file) observe?.(component, 'file');
    const code = fs.readFileSync(file, 'utf8');
    files.set(component, code);
    for (const [index, block] of codeBlocks(file, code).entries()) {
      const extension = block.lang === 'ts' || block.lang === 'tsx' || block.lang === 'jsx' ? block.lang : 'js';
      let virtual = `${component}.__script${index}.${extension}`;
      while (fs.existsSync(virtual)) virtual += `.${extension}`;
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
    if (fs.statSync(directory, { throwIfNoEntry: false })?.isDirectory()) packages.add(fs.realpathSync(directory));
  };
  for (const file of files.keys()) packageOf(file);
  const host = ts.createCompilerHost(options);
  // Generated imports are outputs of this calculation, not inputs to its next invocation.
  const excluded = (file: string) => authoredRoots.some(directory => {
    const relative = path.relative(directory, file);
    return !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
      && !isPackInputPath(relative, false) && !relative.split(path.sep).includes('node_modules');
  });
  const { readFile, fileExists, getSourceFile, directoryExists, getDirectories } = host;
  host.readFile = file => {
    const script = scripts.get(path.resolve(file));
    if (script !== undefined) return script;
    if (excluded(file)) return undefined;
    observe?.(file, 'file');
    const text = readFile(file);
    if (text !== undefined) { files.set(path.resolve(file), text); packageOf(file); }
    return text;
  };
  host.fileExists = file => {
    if (scripts.has(path.resolve(file))) return true;
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
  host.getSourceFile = (file, version, onError, fresh) => {
    const script = scripts.get(path.resolve(file));
    if (script !== undefined) return ts.createSourceFile(file, script, version, true);
    return excluded(file) ? undefined : getSourceFile(file, version, onError, fresh);
  };
  const program = ts.createProgram({ rootNames, options, host });
  for (const source of program.getSourceFiles()) {
    if (scripts.has(path.resolve(source.fileName))) continue;
    observe?.(source.fileName, 'file');
    files.set(path.resolve(source.fileName), source.text);
    packageOf(source.fileName);
  }
  const hash = createHash('sha256');
  // Logical and physical aliases describe the same input, including /var -> /private/var on macOS.
  const canonical = new Map([...files].map(([file, text]) =>
    [path.relative(realRoot, fs.realpathSync.native(file)).split(path.sep).join('/'), text] as const));
  for (const [file, text] of [...canonical].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) hash.update(JSON.stringify([file, text]));
  const relative = (directory: string) => path.relative(realRoot, directory).split(path.sep).join('/');
  return { hash: hash.digest('hex'), packageDirectories: [...packages].sort((a, b) => relative(a) < relative(b) ? -1 : relative(a) > relative(b) ? 1 : 0) };
}
