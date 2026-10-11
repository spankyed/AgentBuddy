// A step type's parts may come from different packs — a build facet from one, a frontend facet from
// another — so registering the same type twice combines them rather than replacing. What a later
// registration doesn't set is what the earlier one said.
import { describe, expect, it } from 'vitest';
import { _mergeStepDefinitions, type StepDefinition } from '../../src/steps/index.ts';

const facet = (name: string) => ({ [name]: true }) as never;
const step = (parts: Partial<StepDefinition>): StepDefinition => ({ type: 'note', ...parts } as StepDefinition);

describe('merging a step definition into one of its type', () => {
  it("combines the facets two registrations set between them", () => {
    const merged = _mergeStepDefinitions(
      step({ kind: 'step', build: facet('build') }),
      step({ fe: facet('fe') }),
    );

    expect(merged).toMatchObject({ type: 'note', kind: 'step', build: facet('build'), fe: facet('fe') });
  });

  it('lets the later registration replace a facet the earlier one set', () => {
    const merged = _mergeStepDefinitions(step({ build: facet('first') }), step({ build: facet('second') }));

    expect(merged.build).toEqual(facet('second'));
  });

  // Spread alone would drop it: `{ ...existing, ...def }` copies an explicit `undefined` over. Generated
  // pack code that writes `dsl: someCondition ? x : undefined` is the shape that would hit it.
  it("keeps the earlier facet when the later registration names it but sets nothing", () => {
    const merged = _mergeStepDefinitions(
      step({ dsl: facet('dsl'), trigger: facet('trigger') }),
      { type: 'note', dsl: undefined, trigger: undefined } as StepDefinition,
    );

    expect(merged.dsl).toEqual(facet('dsl'));
    expect(merged.trigger).toEqual(facet('trigger'));
  });

  it('leaves out a facet neither registration sets, rather than carrying an undefined key', () => {
    const merged = _mergeStepDefinitions(step({ build: facet('build') }), step({}));

    expect('fe' in merged).toBe(false);
    expect('dsl' in merged).toBe(false);
  });

  it("keeps the earlier kind when the later registration has none: a trigger doesn't become a step", () => {
    const merged = _mergeStepDefinitions(step({ kind: 'trigger', trigger: facet('trigger') }), step({ fe: facet('fe') }));

    expect(merged.kind).toBe('trigger');
  });
});
