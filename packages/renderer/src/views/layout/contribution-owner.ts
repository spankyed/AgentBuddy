import { hostDeclaration } from '@apackdev/host/fe';
import { fePacks } from '@/runtime/packs';
import { windowCatalog } from '@/runtime/catalog';

/** A pane cannot retry a retired frontend or a binding whose installed declarations changed. */
export function currentFrontendIdentity(packId: string) {
  const identity = fePacks.frontendIdentity(packId);
  if (!identity) return undefined;
  const snapshot = windowCatalog.getSnapshot();
  if (packId === hostDeclaration.id || snapshot?.native.some(pack => pack.id === packId)) {
    return identity.declarationRevision === undefined && identity.registrationId === undefined && identity.buildRevision === undefined
      ? identity : undefined;
  }
  const owner = snapshot?.packs.find(pack => pack.snapshot.manifest.id === packId);
  return windowCatalog.status() === 'ready' && owner?.enabled && identity.registrationId
    && identity.declarationRevision === owner.snapshot.declarationRevision && identity.buildRevision
    && identity.buildRevision === owner.buildRevision ? identity : undefined;
}
