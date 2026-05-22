<template>
  <div v-if="visible" class="flex items-center border-t border-neutral-800 bg-neutral-900 overflow-hidden">
    <TabBar :tabs="tabs" :activeTabId="activeTabId" :tabGroups="tabGroups" />
  </div>
</template>

<script setup lang="ts">
import { applicationState } from '@/main';
import { useSelector } from '@xstate/vue';
import { id, type ThreadsState } from '@/plugins/threads/state';
import TabBar from '@/plugins/threads/canvas/agent/tabs/tab-bar.vue';

defineProps<{
  visible: boolean;
}>();

const actor: ThreadsState = applicationState.system.get(id);

const tabs = useSelector(actor, (state) => state.context.tabs);
const activeTabId = useSelector(actor, (state) => state.context.activeTabId);
const tabGroups = useSelector(actor, (state) => state.context.tabGroups);
</script>
