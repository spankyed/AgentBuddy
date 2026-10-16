import type { PackCatalogSnapshot } from './catalog.ts';
import type { PackCommand, NativePackDeclaration } from '@apackdev/sdk/framework';

export interface CommandCatalogEntry extends Readonly<PackCommand> {
  readonly packId: string;
  readonly origin: 'native' | 'installed' | 'source';
  readonly enabled?: boolean;
  readonly declarationRevision?: string;
  readonly buildRevision?: string;
}

/** Metadata survives runtime teardown; only the execution picker applies binding eligibility. */
export function commandCatalogEntries(snapshot: PackCatalogSnapshot): readonly CommandCatalogEntry[] {
  const collect = (packId: string, commands: NativePackDeclaration['commands'], origin: CommandCatalogEntry['origin'],
    identity: Pick<CommandCatalogEntry, 'enabled' | 'declarationRevision' | 'buildRevision'> = {}) =>
    Object.entries(commands ?? {}).map(([name, { placeholder }]) => Object.freeze({ packId, name, placeholder, origin, ...identity }));
  return Object.freeze([
    ...snapshot.native.flatMap(pack => collect(pack.id, pack.commands, 'native', { enabled: true })),
    ...snapshot.packs.flatMap(pack => collect(pack.snapshot.manifest.id, pack.snapshot.manifest.extensions?.commands, 'installed',
      { enabled: pack.enabled, declarationRevision: pack.snapshot.declarationRevision, buildRevision: pack.buildRevision })),
    ...snapshot.sourcePacks.flatMap(pack => collect(pack.manifest.id, pack.manifest.extensions?.commands, 'source',
      { declarationRevision: pack.declarationRevision })),
  ]);
}
