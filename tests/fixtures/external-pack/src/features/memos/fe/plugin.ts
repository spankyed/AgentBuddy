import { definePlugin, pluginAccepts } from '@abuddy/sdk/fe';
import { StickyNote } from 'lucide-vue-next';
import state, { type MemosInbox } from './state';
import canvas from './canvas/list.vue';
import settings from './settings.vue';

/** What another feature may send this plugin: the type is the machine's own, so the two can't drift */
export const accepts = pluginAccepts<MemosInbox>();

const memosPlugin = definePlugin({
  label: 'Memos',
  icon: StickyNote,
  state,
  canvas,
  settings,
});

export default memosPlugin;
