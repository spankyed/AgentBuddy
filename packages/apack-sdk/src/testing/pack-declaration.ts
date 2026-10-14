import type { NativePackDeclaration } from '../framework/pack-catalog.ts';
import type { PackRegistration } from '../framework/pack-registration.ts';

/** Compose declaration data from an authored test fixture, before registering its runtime stand-ins. */
export function nativePackDeclarationFixture(fixture: PackRegistration): NativePackDeclaration {
  return {
    id: fixture.id,
    ...(fixture.ears?.entities && { data: { entities: Object.fromEntries(Object.keys(fixture.ears.entities).map(name => [name, null])) } }),
    ...(fixture.dependencies !== undefined && { dependencies: fixture.dependencies }),
    ...(fixture.settings !== undefined && { settings: fixture.settings }),
    features: Object.fromEntries(Object.entries(fixture.features ?? {}).map(([id, feature]) => [id,
      feature.settings === undefined ? {} : { settings: feature.settings }])),
  };
}
