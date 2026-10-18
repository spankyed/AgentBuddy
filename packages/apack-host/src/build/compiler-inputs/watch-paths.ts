import fs from 'node:fs';
import path from 'node:path';

export function physicalWatchPath(file: string, cache = new Map<string, string>()): string {
  const known = cache.get(file);
  if (known) return known;
  let resolved: string;
  // Node drops the final separator for an extended drive root (nodejs/node#62446).
  // Only the root has an equivalent short spelling; retain native handling for other extended paths.
  const query = /^\\\\\?\\[a-z]:\\$/i.test(file) ? file.slice(4) : file;
  try { resolved = fs.realpathSync.native(query); }
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
