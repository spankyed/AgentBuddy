import fs from 'node:fs';
import path from 'node:path';

/**
 * The path the kernel would watch for `file`: symlinks resolved, and a missing file placed under its parent's
 * physical directory. A dangling symlink is followed to its target, resolved from the link's physical directory.
 *
 * Known limit: `..` in a dangling link's own text is collapsed lexically, not through a symlink earlier in that
 * text. For `a -> sub/../b` with `sub` a symlink, the kernel looks beside `sub`'s target and this looks beside the
 * link. Nothing checks it; a link target that appears later there is not seen until something else changes.
 */
export function physicalWatchPath(file: string, cache = new Map<string, string>()): string {
  const known = cache.get(file);
  if (known) return known;
  let resolved: string;
  // Node drops the final separator for an extended drive root (nodejs/node#62446).
  // Only the root has an equivalent short spelling; retain native handling for other extended paths.
  const query = /^\\\\\?\\[a-z]:\\$/i.test(file) ? file.slice(4) : file;
  try { resolved = fs.realpathSync.native(query); }
  catch (error) {
    if (!['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) {
      throw new Error(`Cannot resolve compiler input path ${JSON.stringify(file)} using ${JSON.stringify(query)}`, { cause: error });
    }
    const parent = path.dirname(file);
    if (parent === file) throw error;
    let link: fs.Stats | undefined;
    try { link = fs.lstatSync(file, { throwIfNoEntry: false }); }
    catch (failure) { if ((failure as NodeJS.ErrnoException).code !== 'ENOTDIR') throw failure; }
    // The kernel resolves a relative target from the link's physical directory, not the path that reached it
    resolved = link?.isSymbolicLink() ? physicalWatchPath(path.resolve(physicalWatchPath(parent, cache), fs.readlinkSync(file)), cache)
      : path.join(physicalWatchPath(parent, cache), path.basename(file));
  }
  cache.set(file, resolved);
  return resolved;
}
