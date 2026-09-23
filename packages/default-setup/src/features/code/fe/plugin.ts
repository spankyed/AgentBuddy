import { defineAsyncComponent } from 'vue';
import { definePlugin, pluginAccepts } from '@abuddy/sdk/fe';
import { Code2 } from 'lucide-vue-next';
import state from './state.ts';
import settings from './settings.vue';

const canvas = defineAsyncComponent(() => import('./canvas/canvas.vue'));
const panel = defineAsyncComponent(() => import('./features/panel.vue'));

import type { Event as CodeEvent } from './state.ts';
import type { EARS } from '@/__generated__/ears';
/**
 * What other features ask of the code plugin: which panel to show, and a job for one of its children.
 *
 * The `<child>.*` events aren't in this machine's own union — it routes them to its child actors by prefix — so
 * they are spelled out rather than extracted, and each names the child that handles it.
 */
export const accepts = pluginAccepts<
  | Extract<CodeEvent, { type: 'UPDATE_STATE' }>
  | { type: 'terminal.CREATE'; target: string; command: string; cwd?: string }
  | { type: 'explorer.SET_BASE_DIRECTORY'; path: string }
  | { type: 'codeActions.OPEN_ACTION'; actionId: EARS.EntityId }
  | { type: 'codePrompts.OPEN_PROMPT'; promptId: EARS.EntityId }
>();

const codePlugin = definePlugin({
  label: 'Code',
  icon: Code2,
  state,
  canvas,
  panel,
  settings,
  isPinned: false,
  hotkeys: [
    {
      action: 'openTerminal',
      global: false
    },
    {
      action: 'openTerminalTab',
      global: false
    },
    {
      action: 'navigatePrevPanel',
      global: false
    },
    {
      action: 'navigateNextPanel',
      global: false
    },
    {
      action: 'focusSearch',
      global: false
    }
  ]
});

export default codePlugin;