import { nativePackDeclarationFixture } from '@apackdev/sdk/testing';
import { createPackRegistry, type PackRegistryOptions } from '../packs/registry.ts';

/** Test fixture composition owns declaration admission/removal separately from runtime binding. */
export function createNativePackTestRegistry(options?: PackRegistryOptions): ReturnType<typeof createPackRegistry> {
  const registry = createPackRegistry(options);
  return {
    ...registry,
    registerPack: ((registration, origin) => {
      if (origin) return registry.registerPack(registration, origin);
      const before = registry.catalog.getSnapshot().native;
      const version = before.find(pack => pack.id === registration.id)?.version;
      const declaration = nativePackDeclarationFixture(registration, version === undefined ? {} : { version });
      registry.catalog.setNative([...before.filter(pack => pack.id !== declaration.id), declaration]);
      try { registry.registerPack(registration); }
      catch (error) { registry.catalog.setNative(before); throw error; }
    }) satisfies typeof registry.registerPack,
    unregisterPack: ((id) => {
      registry.unregisterPack(id);
      registry.catalog.setNative(registry.catalog.getSnapshot().native.filter(pack => pack.id !== id));
    }) satisfies typeof registry.unregisterPack,
  };
}
