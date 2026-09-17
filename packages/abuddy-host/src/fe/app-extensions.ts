import type { Component } from 'vue';

/** The components packs registered for the app's extension slots (the welcome screen, say), by slot */
export function createAppExtensionSlots() {
  const bySlot = new Map<string, Component>();
  return {
    register(slot: string, component: Component): void {
      bySlot.set(slot, component);
    },
    unregister(slot: string): void {
      bySlot.delete(slot);
    },
    get: (slot: string): Component | undefined => bySlot.get(slot),
  };
}
