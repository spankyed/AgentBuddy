import type { FePackRegistryView } from '@abuddy/sdk/runtime';
import { createOwnedStore } from '../packs/extensions.ts';

/** A component a pack registered for an app extension slot, as the SDK types it */
type Component = NonNullable<ReturnType<FePackRegistryView['appExtension']>>;

/**
 * The components packs registered for the app's extension slots (the welcome screen, say), by slot.
 * A slot is last-wins, and over `createOwnedStore` so the pack that had it keeps it when the pack that
 * took it unregisters.
 */
export function createAppExtensionSlots() {
  const slots = createOwnedStore<Component>();
  return {
    register: (slot: string, component: Component, owner: string): void => slots.set(slot, component, owner),
    unregister: (slot: string, owner: string): void => slots.remove(slot, owner),
    get: (slot: string): Component | undefined => slots.get(slot),
  };
}
