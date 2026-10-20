import { createHash } from 'node:crypto';
import type { PackManifest } from './manifest.ts';
import { declarationJson } from '../framework/declaration-data.ts';

/** @internal Identity of the declared data; implementation bytes have their own integrity hashes. */
export function _declarationRevision(manifest: PackManifest): string {
  return createHash('sha256').update(declarationJson(manifest)).digest('hex');
}
