import nodeFs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { PackageInputFile } from '@apackdev/host/build/package-inputs';

// Runtime distributions contain physical ASAR files; Electron's patched fs expands them as directories.
const fs: typeof nodeFs = process.versions.electron ? createRequire(import.meta.url)('original-fs') : nodeFs;

export { fs as compilerRuntimeFileSystem };

interface CompilerRuntimeInputs {
  executable: string;
  directory: string;
  hash: string;
  directories: string[];
  links: Array<{ source: string; target: string; text: string }>;
}

/** Node needs its executable; Electron also needs its distribution's native libraries and resources. */
export function readCompilerRuntimeInputs(
  executable = process.execPath,
  electron = !!process.versions.electron,
  onFile?: (file: PackageInputFile, bytes: Buffer) => void,
): CompilerRuntimeInputs {
  executable = fs.realpathSync.native(executable);
  const root = path.dirname(executable);
  const directories: string[] = [];
  const links: CompilerRuntimeInputs['links'] = [];
  const files: Array<[string, number, string]> = [];
  const visited = new Set<string>();
  const relative = (file: string) => path.relative(root, file).split(path.sep).join('/');
  const walk = (file: string) => {
    if (visited.has(file)) return;
    visited.add(file);
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) {
      const text = fs.readlinkSync(file);
      const target = path.resolve(path.dirname(file), text);
      links.push({ source: file, target, text });
      // Preserve dangling links, without inventing a target's contents.
      if (fs.existsSync(target)) walk(fs.realpathSync.native(target));
    } else if (stat.isDirectory()) {
      directories.push(file);
      for (const name of fs.readdirSync(file).sort()) walk(path.join(file, name));
    } else if (stat.isFile()) {
      const bytes = fs.readFileSync(file);
      const hash = createHash('sha256').update(bytes).digest('hex');
      files.push([relative(file), stat.mode & 0o111, hash]);
      onFile?.({ path: relative(file), source: file, mode: stat.mode & 0o777, hash }, bytes);
    } else {
      throw new Error(`Unsupported compiler runtime input: ${file}`);
    }
  };
  walk(executable);
  // The macOS executable is inside Contents/MacOS. Keep the signed distribution together,
  // including Info.plist and sealed resources, as on the other Electron platforms.
  if (electron) walk(process.platform === 'darwin' ? path.dirname(root) : root);
  const identity = [relative(executable), files.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0),
    directories.map(relative).sort(), links.map(({ source, target, text }) => [relative(source), relative(target),
      process.platform === 'win32' || path.isAbsolute(text) ? null : text]).sort()];
  return { executable, directory: electron && process.platform === 'darwin' ? path.dirname(root) : root,
    directories, links, hash: createHash('sha256').update(JSON.stringify(identity)).digest('hex') };
}
