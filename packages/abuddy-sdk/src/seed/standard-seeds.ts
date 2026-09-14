import { SDK_ENTITIES } from '../types/sdk-entities.ts';

/** The standard collection seeds: seed key → the entity type seeded and the field matched on */
export const STANDARD_SEED_DEFAULTS: Record<string, { entityType: string; lookupField: string }> = {
  actions: { entityType: SDK_ENTITIES.Action, lookupField: 'label' },
  prompts: { entityType: SDK_ENTITIES.Prompt, lookupField: 'label' },
};
