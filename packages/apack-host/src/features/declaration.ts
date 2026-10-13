import { HOST_PACK_ID, splitRef } from '@apackdev/sdk/ids';
import type { NativePackDeclaration } from '@apackdev/sdk/framework';
import { HOST } from '../refs.ts';

export const hostFeatureIds = Object.fromEntries(
  (['application', 'packs', 'settings', 'help'] as const).map(name => [name, splitRef(HOST[name])!.featureId]),
) as Record<'application' | 'packs' | 'settings' | 'help', string>;

/** Host declarations exist before any host system is constructed or registered. */
export const hostDeclaration: NativePackDeclaration = {
  id: HOST_PACK_ID,
  features: Object.fromEntries(Object.values(hostFeatureIds).map(id => [id, {}])),
};
