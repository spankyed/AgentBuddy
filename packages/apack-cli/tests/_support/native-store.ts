import fs from 'node:fs';
import path from 'node:path';

/** Whether `file` is a dependency's native file loaded from this worker's compiler store, beside its installations */
export function inNativeStore(file: string): boolean {
  return file.startsWith(path.join(fs.realpathSync.native(process.env.APACK_COMPILER_STORE!), 'natives') + path.sep);
}
