<template>
  <div class="flex overflow-x-auto scrollbar-hide">
    <TabItem
      v-for="tab in sortedTabs"
      :key="tab.id"
      :tab="tab"
      :isActive="tab.id === activeTabId"
      :isPinned="tab.pinned === true"
      @select="$emit('select-tab', tab.id)"
      @close="$emit('close-tab', tab.id)"
      @edit-details="$emit('edit-details', tab.id)"
      @delete-thread="$emit('delete-thread', tab.id)"
      @archive-thread="$emit('archive-thread', tab.id)"
      @unpin-thread="$emit('unpin-thread', tab.id)"
      @pin-thread="$emit('pin-thread', tab.id)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import TabItem from './tab-item.vue';
import type { Tab } from '@app/api';

const props = defineProps<{
  tabs: Tab[];
  activeTabId: string;
}>();

const sortedTabs = computed(() =>
  [...props.tabs].sort((a, b) => Number(b.pinned ?? false) - Number(a.pinned ?? false))
);

defineEmits<{
  'select-tab': [tabId: string];
  'close-tab': [tabId: string];
  'edit-details': [tabId: string];
  'delete-thread': [tabId: string];
  'archive-thread': [tabId: string];
  'unpin-thread': [tabId: string];
  'pin-thread': [tabId: string];
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