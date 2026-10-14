import type { FeatureRef } from '../ids/refs.ts';
import type { ReferenceDeclarations } from './reference-declaration.ts';

/** Declaration data is immutable independently of executable binding availability. */
export type DeclarationData<T> = T extends object ? { readonly [K in keyof T]: DeclarationData<T[K]> } : T;

export interface ReferenceCatalogEntry {
  readonly featureRef: FeatureRef;
  readonly packId: string;
  readonly origin: 'native' | 'installed' | 'source';
  readonly declaration: DeclarationData<ReferenceDeclarations>;
  readonly declarationRevision?: string;
  readonly buildRevision?: string;
  readonly enabled?: boolean;
}

/** Typed projections of the common declaration inventory; reading never activates a pack. */
export interface PackCatalogView {
  status(): 'loading' | 'ready' | 'disconnected' | 'error' | 'disposed';
  problem(): string | undefined;
  references(): readonly ReferenceCatalogEntry[];
  subscribe(listener: () => void): () => void;
}
