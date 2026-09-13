import { describe, expect, it } from 'vitest';
import { steps as registeredSteps } from '../../src/extensions/steps/register';
import { steps as buildSteps } from '../../src/extensions/steps/build';

/**
 * build.ts ships as build/steps.build.mjs: packs that depend on default-setup validate their
 * flows with it. A step registered for the host but missing here would reject those flows
 * ("Invalid step type"), and a diverging build facet would validate differently than the host.
 */
describe('default-setup step barrels', () => {
  it('ship a build facet for every registered step', () => {
    expect(buildSteps.map(s => s.type).sort()).toEqual(registeredSteps.map(s => s.type).sort());
  });

  it('use the same build and trigger code the host registers', () => {
    for (const step of registeredSteps) {
      const build = buildSteps.find(s => s.type === step.type)!;
      expect(build.build, step.type).toBe(step.build);
      expect(build.trigger?.compile, step.type).toBe(step.trigger?.compile);
    }
  });
});
