// plugins/types.ts
import type { Component } from 'vue';
import type { AnyStateMachine } from 'xstate';

export type PluginSection = 'canvas' | 'panel';

export interface Plugin {
  /** Toolbar key */
  id: string;
  label: string;
  icon: Component;

  /** XState definition – the host will spin up the actor lazily */
  machine: AnyStateMachine;

  /** UI fragments (omit one to fall back to Main) */
  canvas?: Component;
  panel?: Component;
}

export default {
  
}