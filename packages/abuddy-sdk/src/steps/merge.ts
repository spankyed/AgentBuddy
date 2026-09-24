import type { StepDefinition } from './types.ts';

/**
 * Every part of a step a later definition may leave to an earlier one.
 *
 * `{ ...existing, ...def }` alone keeps a part the later definition omits, but loses one it sets to
 * `undefined` explicitly — a generated `dsl: cond ? x : undefined` would drop the earlier pack's. Listing
 * them makes that a value the later definition didn't set rather than one it cleared, and the check below
 * fails to compile when a part is added to `StepDefinition` and not to this list.
 */
const FACETS = ['kind', 'build', 'runtime', 'fe', 'trigger', 'dsl'] as const satisfies readonly (keyof StepDefinition)[];

type UnmergedFacet = Exclude<keyof StepDefinition, 'type' | (typeof FACETS)[number]>;
const _everyFacetMerges: [UnmergedFacet] extends [never] ? true : UnmergedFacet = true;
void _everyFacetMerges;

/**
 * @internal A step definition merged into an earlier one of its type, facet by facet: a build facet and a runtime
 * one registered separately combine, and a facet the later definition sets replaces the earlier one's
 */
export function _mergeStepDefinitions(existing: StepDefinition, def: StepDefinition): StepDefinition {
  const merged = { ...existing, ...def };
  for (const facet of FACETS) {
    const kept = def[facet] ?? existing[facet];
    if (kept === undefined) delete merged[facet];
    else (merged as Record<string, unknown>)[facet] = kept;
  }
  return merged;
}
