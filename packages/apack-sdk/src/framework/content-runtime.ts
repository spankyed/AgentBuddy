import type { ContentWriter } from '../content/writers.ts';

/** Generated content bindings used without activating a pack's systems or services. */
export interface ContentRuntime {
  id: string;
  /** Identity of the manifest that generated this source or bundled runtime. */
  declarationRevision: string;
  entities: Record<string, string>;
  relKinds: Record<string, string>;
  repositories: Record<string, unknown>;
  contentWriters: Record<string, ContentWriter>;
}
