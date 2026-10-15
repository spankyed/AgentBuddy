import type { StepEntry } from '../build/manifest.ts';
import type { NativePackDeclaration } from '../framework/pack-catalog.ts';
import type { PackRegistration } from '../framework/pack-registration.ts';

/** Compose declaration data from an authored test fixture, before registering its runtime stand-ins. */
export function nativePackDeclarationFixture(fixture: PackRegistration): NativePackDeclaration {
  return {
    id: fixture.id,
    ...(fixture.lifecycle && { lifecycle: Object.fromEntries(Object.keys(fixture.lifecycle).map(name =>
      [name, `fixtures/lifecycle.ts#${name}`])) }),
    ...(fixture.ears && { data: {
      entities: Object.fromEntries(Object.keys(fixture.ears.entities ?? {}).map(name => [name, null])),
      relations: Object.values(fixture.ears.relKinds ?? {}),
    } }),
    ...(fixture.steps !== undefined && { steps: Object.fromEntries(fixture.steps.map(step => {
      const prefix = `fixtures/steps.ts#${step.type.replace(/[^A-Za-z0-9_$]/g, '_')}`;
      const runtime = step.runtime;
      const node = step.node;
      if (node === undefined) throw new Error(`Native step fixture "${fixture.id}/${step.type}" needs declared node data`);
      return [step.type, {
        node, ...(step.kind !== undefined && { kind: step.kind }),
        ...(step.build && { build: {
          compile: `${prefix}Compile`, validate: `${prefix}Validate`, getLabel: `${prefix}GetLabel`,
          ...(step.build.decompile && { decompile: `${prefix}Decompile` }),
          ...(step.build.branches && { branches: `${prefix}Branches` }),
          ...(step.build.relation !== undefined && { relation: step.build.relation }),
        } }),
        ...(step.trigger && { trigger: {
          trackField: step.trigger.trackField, compile: `${prefix}Compile`, decompile: `${prefix}Decompile`,
          ...(step.trigger.persistent !== undefined && { persistent: step.trigger.persistent }),
          ...(step.trigger.queryFields !== undefined && { queryFields: step.trigger.queryFields }),
          ...(step.trigger.validateTrack && { validateTrack: `${prefix}ValidateTrack` }),
          ...(step.trigger.validate && { validate: `${prefix}Validate` }),
          ...(step.trigger.register && { register: `${prefix}Register` }),
        } }),
        ...(runtime && { runtime: {
          ...(runtime.handler && { handler: `${prefix}Handler` }),
          ...(runtime.isAsync && { isAsync: true }), ...(runtime.waits && { waits: true }),
          ...(runtime.spawnsSubflow && { spawnsSubflow: true }),
        } }),
      } satisfies StepEntry];
    })) }),
    ...(fixture.dependencies !== undefined && { dependencies: fixture.dependencies }),
    ...(fixture.settings !== undefined && { settings: fixture.settings }),
    features: Object.fromEntries(Object.entries(fixture.features ?? {}).map(([id, feature]) => [id,
      { description: `Test fixture for ${id}.`, ...(feature.settings !== undefined && { settings: feature.settings }) }])),
  };
}
