import type { StepDefinition } from './types.ts';

/**
 * @internal A step definition merged into an earlier one of its type, facet by facet: a build facet and a runtime
 * one registered separately combine, and a facet the later definition sets replaces the earlier one's
 */
export function _mergeStepDefinitions(existing: StepDefinition, def: StepDefinition): StepDefinition {
  return {
    ...existing,
    ...def,
    build: def.build ?? existing.build,
    runtime: def.runtime ?? existing.runtime,
    fe: def.fe ?? existing.fe,
    trigger: def.trigger ?? existing.trigger,
    kind: def.kind ?? existing.kind,
  };
}
