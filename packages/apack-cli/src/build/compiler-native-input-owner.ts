import fs from 'node:fs';
import path from 'node:path';
import { beginCompilerNativeModules, compilerDiagnostic, compilerSourcePath, withoutCompilerFileReads,
  type createCompilerFileView, type CompilerPathMapping } from '@apackdev/host/build/compiler-inputs';
import { captureCompilerPackage } from './compiler-package-inputs.ts';
import { assertCapturedMachOLibraries, type MachOLibraryEnvironment } from './compiler-native-libraries.ts';
import { createCompilerReadTree, type CompilerReadTree } from './compiler-read-tree.ts';

export interface CapturedNativeModule { readonly source: string; readonly captured: string; readonly packageRoot: string }

/** Owned native bytes; Vite captures selected images so authored sources remain live. */
export function createCompilerNativeInputs(original: ReturnType<typeof createCompilerFileView>, workspace: string,
  paths: readonly CompilerPathMapping[], nativeEnvironment: MachOLibraryEnvironment, options: {
    capture: 'package' | 'images';
    retainTree?: boolean;
    findModule?(file: string): CapturedNativeModule | undefined;
    onCapture?(): void;
  }) {
  const modules = new Map<string, CapturedNativeModule>();
  const within = (parent: string, file: string) => {
    const relative = path.relative(parent, file);
    return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
  };
  const includes = (file: string) => !within(workspace, file) && !paths.some(({ captured }) => within(captured, file));
  let tree: CompilerReadTree | undefined;
  const sourcePath = (file: string) => tree?.sourcePath(file) ?? compilerSourcePath(file, paths);
  const readDataPath = (file: string) => withoutCompilerFileReads(() => {
    if (!includes(file)) return file;
    file = sourcePath(file);
    const bytes = original.readDataBytes(file);
    const location = original.captureLocation(file, 'file');
    tree ??= createCompilerReadTree({ files: [], locations: [], links: [] }, paths);
    tree.includeData({ files: bytes === undefined ? [] : [original.captureFile(file, bytes)],
      locations: [...(location ? [location] : []), ...original.ancestors(file)], links: [] });
    return tree.dataPath(file);
  });
  const nativePackages = new Set<string>();
  const packageRoot = (file: string, exists: (file: string) => boolean) => {
    for (let directory = path.dirname(file); ; directory = path.dirname(directory)) {
      if (exists(path.join(directory, 'package.json'))) return directory;
      if (path.dirname(directory) === directory) return path.dirname(file);
    }
  };
  const nativeModule = (file: string): string => {
    if (process.platform !== 'darwin') return file;
    const known = options.findModule?.(file);
    if (known) {
      assertCapturedMachOLibraries(known.captured, known.packageRoot, {
        arch: process.arch, environment: nativeEnvironment, realpath: file => fs.realpathSync.native(file),
        read: file => fs.statSync(file, { throwIfNoEntry: false })?.isFile() ? fs.readFileSync(file) : undefined,
      });
      return known.captured;
    }
    // Compiler-installation and earlier read-tree copies already have an input owner. Inspect their
    // actual images without recording ephemeral private paths as new source inputs.
    if (!includes(file) || sourcePath(file) !== file) {
      assertCapturedMachOLibraries(file, packageRoot(file, fs.existsSync), {
        arch: process.arch, environment: nativeEnvironment,
        realpath: file => fs.realpathSync.native(file),
        read: file => includes(file) && sourcePath(file) === file ? original.readDataBytes(file)
          : fs.statSync(file, { throwIfNoEntry: false })?.isFile() ? fs.readFileSync(file) : undefined,
      });
      return file;
    }
    const owner = packageRoot(file, original.fileSystem.fileExists);
    if (options.capture === 'package' && !nativePackages.has(owner)) {
      const { snapshot } = captureCompilerPackage(owner, original.captureDataLocation, (file, bytes) =>
        original.captureFile(file.source, original.readDataBytes(file.source) ?? bytes));
      tree ??= createCompilerReadTree({ files: [], locations: [], links: [] }, paths);
      tree.includeData(snapshot);
      nativePackages.add(owner);
    }
    assertCapturedMachOLibraries(file, owner, {
      arch: process.arch, environment: nativeEnvironment, realpath: original.fileSystem.realpath,
      read(candidate) {
        const bytes = original.readDataBytes(candidate);
        if (options.capture === 'images' && bytes && within(owner, candidate)) readDataPath(candidate);
        return bytes;
      },
    });
    const captured = readDataPath(file);
    modules.set(file, { source: file, captured, packageRoot: tree!.dataPath(owner) });
    return captured;
  };
  const admit = (file: string) => {
    try { return nativeModule(file); }
    finally { options.onCapture?.(); }
  };
  const stopNativeModules = beginCompilerNativeModules(admit);
  return {
    includes, sourcePath, readDataPath, nativeModule: admit,
    modules: () => [...modules.values()], copies: () => tree?.observations(),
    diagnostic: (message: string) => compilerDiagnostic(tree?.diagnostic(message) ?? message, paths),
    assertCurrent() { withoutCompilerFileReads(() => { original.assertCurrent(); tree?.assertCurrent(); }); },
    dispose() {
      withoutCompilerFileReads(() => {
        stopNativeModules();
        try { original.dispose(); } finally { if (!options.retainTree) tree?.dispose(); }
      });
    },
  };
}
