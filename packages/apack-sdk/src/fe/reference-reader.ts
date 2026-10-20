import { boundFeHost } from '../runtime/fe-host.ts';
import type { DeclarationData, ReferenceCatalogEntry } from '../framework/catalog-view.ts';
import type { ReferenceCategoryDeclaration, ReferenceTypeDeclaration } from '../framework/reference-declaration.ts';
import type { ReferenceBinding, ReferenceBindings, ReferenceTypeConfig } from './reference-types.ts';
import type { FeatureRef } from '../ids/refs.ts';

export interface ReferenceCategoryMetadata {
  readonly id: string;
  readonly featureRef: FeatureRef;
  readonly declaration: DeclarationData<ReferenceCategoryDeclaration>;
}

function ownerOf(name: string, group: 'types' | 'categories'): ReferenceCatalogEntry | undefined {
  const owners = boundFeHost().catalog.references().filter(entry => Object.hasOwn(entry.declaration[group], name));
  // Authoring sources describe possible builds, not additional runtime claims.
  const runtimeOwners = owners.filter(entry => entry.origin !== 'source');
  const candidates = runtimeOwners.length ? runtimeOwners : owners;
  return candidates.length === 1 ? candidates[0] : undefined;
}

/** Current declared presentation; reading never consults executable registrations. */
export function getReferenceTypeDeclaration(name: string): DeclarationData<ReferenceTypeDeclaration> | undefined {
  return ownerOf(name, 'types')?.declaration.types[name];
}

/** Category labels remain discoverable when unavailable; runtime claims supersede source previews. */
export function getReferenceCategoryDeclarations(): readonly ReferenceCategoryMetadata[] {
  const entries = boundFeHost().catalog.references();
  const runtimeNames = new Set(entries.filter(entry => entry.origin !== 'source')
    .flatMap(entry => Object.keys(entry.declaration.categories)));
  return Object.freeze(entries.flatMap(entry => Object.entries(entry.declaration.categories)
    .filter(([id]) => entry.origin !== 'source' || !runtimeNames.has(id))
    .map(([id, declaration]) => Object.freeze({ id, featureRef: entry.featureRef, declaration }))));
}

function matches<T>(owner: ReferenceCatalogEntry, accepted: ReferenceBinding<T>): boolean {
  if (owner.featureRef !== accepted.featureRef || owner.enabled !== true) return false;
  if (owner.origin === 'native') {
    return accepted.declarationRevision === undefined && accepted.buildRevision === undefined && accepted.registrationId === undefined;
  }
  return owner.origin === 'installed' && !!owner.declarationRevision && !!owner.buildRevision && !!accepted.registrationId
    && owner.declarationRevision === accepted.declarationRevision && owner.buildRevision === accepted.buildRevision;
}

function eligible<T>(name: string, group: 'types' | 'categories', bindings: () => ReadonlyMap<string, ReferenceBinding<T>>): ReferenceBinding<T> | undefined {
  if (boundFeHost().catalog.status() !== 'ready') return undefined;
  const owner = ownerOf(name, group);
  if (!owner) return undefined;
  const accepted = bindings().get(name);
  return accepted && matches(owner, accepted) ? accepted : undefined;
}

/** Accepted navigation/icon binding only while its owner and installed build match current declarations. */
export function getReferenceTypeBinding(name: string): ReferenceBinding<ReferenceTypeConfig> | undefined {
  return eligible(name, 'types', () => boundFeHost().packs.referenceTypes());
}

/** Reading this entry does not start the provider; call it only in an owned reactive scope. */
export function getReferenceCategoryBinding(name: string): ReferenceBinding<ReferenceBindings['categories'][string]> | undefined {
  return eligible(name, 'categories', () => boundFeHost().packs.referenceCategories());
}

/** Accepted bindings and declarations publish independently; reactive consumers must observe both. */
export function onReferenceBindingsChanged(listener: () => void): () => void {
  return boundFeHost().packs.onChanged(listener);
}
