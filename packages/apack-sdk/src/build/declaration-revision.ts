import { createHash } from 'node:crypto';
import type { PackManifest } from './manifest.ts';
import { isPlainObject } from '../utils/shared.ts';

/** @internal Identity of the declared data; implementation bytes have their own integrity hashes. */
export function _declarationRevision(manifest: PackManifest): string {
  const data = JSON.stringify(manifest, (_key, value) => isPlainObject(value)
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value);
  return createHash('sha256').update(data).digest('hex');
}
