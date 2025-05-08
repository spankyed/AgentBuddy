// plugins/types.ts
import type { Component } from 'vue';
import type { AnyStateMachine } from 'xstate';

type RouteName = string;
export type RouteComponents = Record<RouteName, Component>;

export interface Plugin {
  /** Toolbar key */
  id: string;
  label: string;
  icon?: Component;
  /** XState definition – the host will spin up the actor lazily */
  state: AnyStateMachine;
  /** UI fragments (omit one to fall back to Main) */
  canvas?: Component | RouteComponents;
  panel?: Component;
  chat?: Component;
  isPinned?: boolean;
}
