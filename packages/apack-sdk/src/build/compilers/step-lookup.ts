// The step definitions a compile works with: the ones it's given (tooling), or the registered packs'
import { stepRegistry } from '../../steps/registry.ts';
import type { StepBuildFacet, StepDefinition, TriggerFacet } from '../../steps/types.ts';

export interface StepLookup {
  getBuild(type: string): StepBuildFacet | undefined;
  getTrigger(type: string): TriggerFacet | undefined;
  isTrigger(type: string): boolean;
  triggers(): StepDefinition[];
  types(): string[];
}

/** Looks steps up in `defs`, or, without them, in the registered packs (`stepRegistry`) */
export function stepLookup(defs?: readonly StepDefinition[]): StepLookup {
  if (!defs) return stepRegistry;
  const byType = new Map(defs.map((def) => [def.type, def]));
  return {
    getBuild: (type) => byType.get(type)?.build,
    getTrigger: (type) => byType.get(type)?.trigger,
    isTrigger: (type) => byType.get(type)?.kind === 'trigger',
    triggers: () => [...byType.values()].filter((def) => def.kind === 'trigger'),
    types: () => [...byType.keys()],
  };
}
