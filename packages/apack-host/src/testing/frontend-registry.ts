import { nativeFrontendDeclarationFixture } from '@apackdev/sdk/testing';
import type { NativePackDeclaration } from '@apackdev/sdk/framework';
import type { PackFERegistration } from '@apackdev/sdk/fe';
import { createFePackRegistry, type FrontendSettingsBinding } from '../fe/pack-store.ts';

/** Explicit fixture operations wrap declaration composition; production admission methods stay intact. */
export function createNativeFrontendTestRegistry(declarations: readonly NativePackDeclaration[] = [], registry = createFePackRegistry()) {
  const declared = new Map(declarations.map(value => [value.id, value]));
  const authority = (registration: PackFERegistration) => ({ kind: 'native' as const,
    declaration: declared.get(registration.id) ?? nativeFrontendDeclarationFixture(registration) });
  return {
    ...registry,
    registerFixture(registration: PackFERegistration, settings?: FrontendSettingsBinding) {
      return registry.registerPackFE(authority(registration), registration, settings);
    },
    replaceFixture(registration: PackFERegistration, settings?: FrontendSettingsBinding) {
      return registry.replacePackFE(authority(registration), registration, settings);
    },
    prepareFixture(registration: PackFERegistration, settings?: FrontendSettingsBinding, replacing = false) {
      return registry.preparePackFE(authority(registration), registration, settings, replacing);
    },
  };
}
