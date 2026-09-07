/**
 * Default-Setup FE Pack Entry
 *
 * Registers all FE contributions (plugins, tiptap extensions, app extensions,
 * artifacts, blocks) into the SDK pack store as a side effect of import.
 * FE counterpart to pack-entry.ts (backend).
 */

import { registerPackFE } from '@abuddy/sdk/fe';
import { plugins, defaultPlugin } from './registries/plugins';
import { designations } from './registries/designations';
import { tiptapPlugins } from './registries/tiptap-plugins';
import { artifactDefinitions } from './artifacts/register-fe';
import { blockDefinitions } from './blocks/register-fe';
import Welcome from './extensions/Welcome.vue';

registerPackFE({
  plugins,
  defaultPlugin,
  designations,
  tiptapPlugins,
  appExtensions: { welcome: Welcome },
  artifacts: artifactDefinitions,
  blocks: blockDefinitions,
});
