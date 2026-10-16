import type { StepEntry } from '../build/manifest.ts';
import type { FeatureRef } from '../ids/refs.ts';
import type { ReferenceDeclarations } from './reference-declaration.ts';
import type { FrontendDeclaration } from './frontend-declaration.ts';
import type { z } from 'zod';
import type { ArtifactEntrySchema, BlockEntrySchema } from './declaration-schema.ts';

export type ArtifactDeclaration = z.infer<typeof ArtifactEntrySchema>;
export type BlockDeclaration = z.infer<typeof BlockEntrySchema>;

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

export interface FrontendCatalogEntry {
  readonly packId: string;
  readonly origin: 'native' | 'installed' | 'source';
  readonly declaration: DeclarationData<FrontendDeclaration>;
  readonly declarationRevision?: string;
  readonly buildRevision?: string;
  readonly enabled?: boolean;
}

/** Step wire identity belongs to its declaring pack; runtime readiness is a separate concern. */
export interface StepCatalogEntry {
  readonly type: string;
  readonly packId: string;
  readonly origin: 'native' | 'installed' | 'source';
  readonly declaration: DeclarationData<StepEntry>;
  readonly declarationRevision?: string;
  readonly buildRevision?: string;
  readonly enabled?: boolean;
}

export interface ArtifactCatalogEntry {
  readonly type: string;
  readonly packId: string;
  readonly origin: 'native' | 'installed' | 'source';
  readonly declaration: DeclarationData<ArtifactDeclaration>;
  readonly declarationRevision?: string;
  readonly buildRevision?: string;
  readonly enabled?: boolean;
}

export interface BlockCatalogEntry {
  readonly type: string;
  readonly packId: string;
  readonly origin: 'native' | 'installed' | 'source';
  readonly declaration: DeclarationData<BlockDeclaration>;
  readonly declarationRevision?: string;
  readonly buildRevision?: string;
  readonly enabled?: boolean;
}

/** Typed projections of the common declaration inventory; reading never activates a pack. */
export interface PackCatalogView {
  status(): 'loading' | 'ready' | 'disconnected' | 'error' | 'disposed';
  problem(): string | undefined;
  references(): readonly ReferenceCatalogEntry[];
  frontend(): readonly FrontendCatalogEntry[];
  steps(): readonly StepCatalogEntry[];
  artifacts(): readonly ArtifactCatalogEntry[];
  blocks(): readonly BlockCatalogEntry[];
  subscribe(listener: () => void): () => void;
}
