<template>
  <div v-if="visible" class="shrink-0 bg-neutral-900" :class="$style.wrapper">
    <div class="flex items-center">
      <TabBar class="flex-1 min-w-0" :tabs="tabs" :activeTabId="activeTabId" :tabGroups="tabGroups" />
      <div class="shrink-0 relative flex items-center self-stretch border-l border-neutral-800" :class="$style.closeContainer">
        <div class="absolute top-0 bottom-0 right-full w-16 bg-gradient-to-l from-neutral-900 to-transparent pointer-events-none z-10" />
        <button
          type="button"
          class="flex items-center justify-center w-7 h-7 mx-1.5 rounded-md text-neutral-500 hover:text-neutral-200 hover:bg-neutral-700/60 transition-colors"
          title="Close tab bar (⌘+click title)"
          @click="$emit('close')"
        >
          <X :size="16" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { X } from 'lucide-vue-next';
import { applicationState } from '@/main';
import { useSelector } from '@xstate/vue';
import { id, type ThreadsState } from '@/plugins/threads/state';
import TabBar from '@/plugins/threads/canvas/agent/tabs/tab-bar.vue';

defineProps<{
  visible: boolean;
}>();

defineEmits<{
  close: [];
}>();

const actor: ThreadsState = applicationState.system.get(id);

const tabs = useSelector(actor, (state) => state.context.tabs);
const activeTabId = useSelector(actor, (state) => state.context.activeTabId);
const tabGroups = useSelector(actor, (state) => state.context.tabGroups);
</script>

<style module>
.wrapper {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  border-bottom: 1px solid rgb(38, 38, 38);
}

.closeContainer {
  background: rgb(23, 23, 23);
}
</style>
