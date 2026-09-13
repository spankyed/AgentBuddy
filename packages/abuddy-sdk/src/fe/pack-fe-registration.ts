import type { Component } from 'vue';
import type { Plugin } from './plugin.ts';
import type { TiptapPlugin } from './tiptap-plugins.ts';
import type { ArtifactDefinition } from '../artifacts/types.ts';
import type { BlockDefinition } from '../blocks/types.ts';
import type { StepDefinition } from '../steps/types.ts';

/** What a pack's generated FE entry registers with the host. */
export interface PackFERegistration {
  plugins?: Plugin[];
  defaultPlugin?: Plugin;
  steps?: StepDefinition[];
  tiptapPlugins?: TiptapPlugin[];
  appExtensions?: Record<string, Component>;
  artifacts?: ArtifactDefinition[];
  blocks?: BlockDefinition[];
}
