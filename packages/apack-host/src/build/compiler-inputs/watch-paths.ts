import fs from 'node:fs';
import path from 'node:path';

export function physicalWatchPath(file: string, cache = new Map<string, string>()): string {
  const known = cache.get(file);
  if (known) return known;
  let resolved: string;
  // Compiler roots and namespace entries share native realpath, including Windows extended paths.
  try { resolved = fs.realpathSync.native(file); }
  catch (error) {
    if (!['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
    const parent = path.dirname(file);
    if (parent === file) throw error;
    let link: fs.Stats | undefined;
    try { link = fs.lstatSync(file, { throwIfNoEntry: false }); }
    catch (failure) { if ((failure as NodeJS.ErrnoException).code !== 'ENOTDIR') throw failure; }
    resolved = link?.isSymbolicLink() ? physicalWatchPath(path.resolve(parent, fs.readlinkSync(file)), cache)
      : path.join(physicalWatchPath(parent, cache), path.basename(file));
  }
  cache.set(file, resolved);
  return resolved;
}
