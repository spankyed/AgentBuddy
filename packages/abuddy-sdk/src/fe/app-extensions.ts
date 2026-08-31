import type { Component } from 'vue';

const extensions = new Map<string, Component>();

export function registerAppExtension(slot: string, component: Component): void {
  extensions.set(slot, component);
}

export function getAppExtension(slot: string): Component | undefined {
  return extensions.get(slot);
}

export function hasAppExtension(slot: string): boolean {
  return extensions.has(slot);
}
