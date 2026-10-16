// Runs below tsx in Node's loader thread: tsx sees logical source URLs, native reads see owned bytes.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

let directory, namespace, closed;
export function initialize(data) {
  ({ directory, namespace } = data);
  closed = new Int32Array(data.closed);
}

/** The canonical storage projection shared by the input owner and loader thread. */
export function compilerReadMapping(directory, file) {
  const sourceRoot = path.parse(file).root;
  const readRoot = path.join(directory, Buffer.from(sourceRoot).toString('hex'));
  return { sourceRoot, readRoot, readPath: path.join(readRoot, path.relative(sourceRoot, file)) };
}

export async function load(url, context, next) {
  if (!url.startsWith('file:')) return next(url, context);
  const logical = new URL(url);
  if (logical.searchParams.get('tsx-namespace') !== namespace) return next(url, context);
  if (Atomics.load(closed, 0)) throw new Error('Compiler module load outlived its build');
  const file = fileURLToPath(logical);
  const relative = path.relative(directory, file);
  if (relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) {
    return next(url, context);
  }
  const owned = pathToFileURL(compilerReadMapping(directory, file).readPath);
  owned.search = logical.search;
  owned.hash = logical.hash;
  return next(owned.href, context);
}
