import type { ArtifactDeclaration, BlockDeclaration, DeclarationData } from '../framework/catalog-view.ts';
import type { ArtifactDefinition } from '../artifacts/types.ts';
import type { BlockDefinition } from '../blocks/types.ts';

/** A checked implementation and the declaration/runtime generation that admitted it. */
interface ViewerFrontendBinding<Declaration, Binding> {
  readonly packId: string;
  readonly declaration: DeclarationData<Declaration>;
  readonly declarationRevision?: string;
  readonly runtimeRevision?: string;
  readonly buildRevision?: string;
  readonly binding: Binding;
}

export type ArtifactFrontendBinding = ViewerFrontendBinding<ArtifactDeclaration, ArtifactDefinition>;
export type BlockFrontendBinding = ViewerFrontendBinding<BlockDeclaration, BlockDefinition>;
