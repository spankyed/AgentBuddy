/**
 * Default-Setup Pack Entry
 *
 * Single entry point that declares everything default-setup contributes
 * to the host: systems, services, EARS, boot hooks.
 * Replaces the 6 separate registry imports the API used to consume.
 */

import type { PackRegistration } from '@abuddy/sdk/framework';

import { buildSystemDefs } from './registries/systems';
import { featureServices } from './registries/services';
import { EARS } from './registries/ears';
import { earlyBootSystem, createDefaultSettings } from './registries/boot';
import { runBootSeed } from './registries/seed/index';
import { migrations } from './migrations';
import { standardSteps } from './steps/register';
import { standardArtifacts } from './artifacts/register';
import { standardBlocks } from './blocks/register';

export const registration: PackRegistration = {
  id: 'default-setup',
  systems: buildSystemDefs(),
  services: featureServices,
  steps: standardSteps,
  artifacts: standardArtifacts,
  blocks: standardBlocks,
  ears: {
    entities: Object.fromEntries(
      Object.entries(EARS.Entity).filter(([k, v]) => typeof v === 'string' && k !== 'Custom') as [string, string][]
    ),
    relKinds: Object.fromEntries(
      Object.entries(EARS.RelKind).filter(([k, v]) => typeof v === 'string' && k !== 'Custom') as [string, string][]
    ),
    partitionPolicy: {
      excludedEntityTypes: ['TNode'],
      secretEntityTypes: ['Secret'],
    },
  },
  boot: {
    earlySystem: earlyBootSystem,
    createDefaultSettings,
    seed: runBootSeed,
  },
  migrations,
};
