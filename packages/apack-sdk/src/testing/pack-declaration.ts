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
    ...(fixture.dependencies !== undefined && { dependencies: fixture.dependencies }),
    ...(fixture.settings !== undefined && { settings: fixture.settings }),
    features: Object.fromEntries(Object.entries(fixture.features ?? {}).map(([id, feature]) => [id,
      { description: `Test fixture for ${id}.`, ...(feature.settings !== undefined && { settings: feature.settings }) }])),
  };
}
