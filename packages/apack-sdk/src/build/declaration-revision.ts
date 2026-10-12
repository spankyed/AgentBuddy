import { createHash } from 'node:crypto';
import type { PackManifest } from './manifest.ts';

/** @internal Identity of the declared data; implementation bytes have their own integrity hashes. */
export function _declarationRevision(manifest: PackManifest): string {
  return createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
}
