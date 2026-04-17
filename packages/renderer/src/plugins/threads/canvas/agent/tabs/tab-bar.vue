<template>
  <div class="flex overflow-x-auto scrollbar-hide">
    <TabItem
      v-for="tab in tabs"
      :key="tab.id"
      :tab="tab"
      :isActive="tab.id === activeTabId"
      :isPinned="tab.id === 'dashboard' || tab.pinned === true"
      @select="$emit('select-tab', tab.id)"
      @close="$emit('close-tab', tab.id)"
      @open-in-chat="$emit('open-in-chat', tab.id)"
      @delete-thread="$emit('delete-thread', tab.id)"
    />
  </div>
</template>

<script setup lang="ts">
import TabItem from './tab-item.vue';
import type { Tab } from '@app/api';

defineProps<{
  tabs: Tab[];
  activeTabId: string;
}>();

defineEmits<{
  'select-tab': [tabId: string];
  'close-tab': [tabId: string];
  'open-in-chat': [tabId: string];
  'delete-thread': [tabId: string];
}>();
</script>

<style scoped>
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
</style>