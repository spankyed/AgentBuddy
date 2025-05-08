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

export interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
}

export interface ActionItem {
  id: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  timestamp: Date;
}

export interface ContextItem {
  id: string;
  title: string;
  content: string;
  type: 'text' | 'code' | 'image' | 'json';
}

export interface CanvasContent {
  id: string;
  type: 'text' | 'code' | 'image' | 'graph' | 'table';
  content: string | any;
}
