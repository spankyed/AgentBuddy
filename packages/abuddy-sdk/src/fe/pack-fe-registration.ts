import type { Component } from 'vue';
import type { Plugin } from './plugin.js';
import type { TiptapPlugin } from './tiptap-plugins.js';
import type { ArtifactDefinition } from '../artifacts/types.js';
import type { BlockDefinition } from '../blocks/types.js';
import type { StepDefinition } from '../steps/types.js';

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
