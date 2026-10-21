import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
/**
 * Where a dependency's captured native files live, shared by every build on the machine: one directory per
 * distinct set of bytes, so an addon a build loads keeps one path and macOS security-assesses it once rather
 * than per build. It sits beside the compiler installations in their store, so it is derived from the running
 * installation's own directory — the worker never resolves the store's location itself.
 */
export const compilerNativeStore = (installationDirectory: string): string =>
  path.join(path.dirname(installationDirectory), 'natives');

type NativeEntry = readonly [relative: string, kind: 'file', mode: number, hash: string] | readonly [relative: string, kind: 'link', text: string];

/**
 * Every file and link under `root`, sorted, with what identifies it — or `undefined` when a link points outside
 * `root`, which a copy elsewhere could not keep. A link into `root` is recorded relative, as it is stored.
 */
function inventory(root: string): NativeEntry[] | undefined {
  const entries: NativeEntry[] = [];
  let portable = true;
  const walk = (directory: string) => {
    for (const name of fs.readdirSync(directory).sort()) {
      const file = path.join(directory, name);
      const relative = path.relative(root, file);
      const stat = fs.lstatSync(file);
      if (stat.isSymbolicLink()) {
        const text = fs.readlinkSync(file);
        const target = path.resolve(path.dirname(file), text);
        const inside = path.relative(root, target);
        if (inside.startsWith('..') || path.isAbsolute(inside)) { portable = false; continue; }
        entries.push([relative, 'link', path.relative(path.dirname(file), target)]);
      }
      else if (stat.isDirectory()) walk(file);
      else entries.push([relative, 'file', stat.mode & 0o111, createHash('sha256').update(fs.readFileSync(file)).digest('hex')]);
    }
  };
  walk(root);
  return portable ? entries : undefined;
}

const identity = (entries: readonly NativeEntry[] | undefined): string => JSON.stringify(entries ?? null);

/**
 * Copies `source` into `target` read-only, keeping links' text; `target` does not exist yet. `target` itself stays
 * writable when `root`, since a directory moves only while it is writable and the caller renames it into place.
 */
function copyReadOnly(source: string, target: string, root = false): void {
  fs.mkdirSync(target);
  for (const name of fs.readdirSync(source).sort()) {
    const from = path.join(source, name), to = path.join(target, name);
    const stat = fs.lstatSync(from);
    if (stat.isSymbolicLink()) {
      const target = path.resolve(path.dirname(from), fs.readlinkSync(from));
      fs.symlinkSync(path.relative(path.dirname(from), target), to);
    }
    else if (stat.isDirectory()) copyReadOnly(from, to);
    else {
      fs.copyFileSync(from, to, fs.constants.COPYFILE_FICLONE);
      fs.chmodSync(to, (stat.mode & 0o111) | 0o444);
    }
  }
  if (!root) fs.chmodSync(target, 0o555);
}

/** Removes a read-only store directory */
function remove(directory: string): void {
  const writable = (file: string) => {
    if (!fs.lstatSync(file, { throwIfNoEntry: false })?.isDirectory()) return;
    fs.chmodSync(file, 0o700);
    for (const name of fs.readdirSync(file)) writable(path.join(file, name));
  };
  writable(directory);
  fs.rmSync(directory, { recursive: true, force: true });
}

/**
 * The shared copy of a captured native package: `materialized` is the files a build's read tree holds for one
 * dependency, and the answer is a store directory with exactly those bytes, links and executable bits.
 *
 * Synchronous, because it runs inside Node's native-module loading. So there is no lock: a missing entry is copied
 * into a private staging directory and renamed into place, which either wins or finds another process's identical
 * entry already there. A reused entry is checked byte for byte first, and one that differs is replaced.
 * `undefined` when the package has a link out of itself: the caller keeps the build's own copy.
 */
export function storeCompilerNativePackage(materialized: string, nativeStore: string): string | undefined {
  const entries = inventory(materialized);
  // A Windows directory junction cannot be relative, so a package with links keeps the build's own copy there
  if (entries === undefined || (process.platform === 'win32' && entries.some(([, kind]) => kind === 'link'))) return undefined;
  const key = createHash('sha256').update(identity(entries)).digest('hex').slice(0, 16);
  fs.mkdirSync(nativeStore, { recursive: true });
  const store = fs.realpathSync.native(nativeStore);
  const entry = path.join(store, key);
  const current = () => fs.existsSync(entry) && identity(inventory(entry)) === identity(entries);
  if (current()) return entry;
  // A sibling of the entry, so the rename stays in one directory: a read-only directory cannot move to another parent
  const staging = path.join(store, `.${key}-${process.pid}-${createHash('sha256').update(`${Math.random()}`).digest('hex').slice(0, 8)}`);
  try {
    copyReadOnly(materialized, staging, true);
    if (identity(inventory(staging)) !== identity(entries)) {
      throw new Error(`Captured native package changed while it was stored: ${materialized}`);
    }
    if (fs.existsSync(entry) && !current()) remove(entry);
    try {
      fs.renameSync(staging, entry);
      fs.chmodSync(entry, 0o555);
    }
    catch (error) {
      // Another process published the same bytes first; theirs is as good as this one
      if (!['ENOTEMPTY', 'EEXIST', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? '') || !current()) throw error;
    }
    if (!current()) throw new Error(`Stored native package differs from its capture: ${entry}`);
    return entry;
  } finally { if (fs.existsSync(staging)) remove(staging); }
}
