<template>
  <div class="flex items-center border-b border-neutral-700 bg-neutral-900">
    <div class="flex overflow-x-auto scrollbar-hide">
      <TabItem
        v-for="tab in tabs"
        :key="tab.id"
        :tab="tab"
        :isActive="tab.id === activeTabId"
        :isPinned="tab.id === 'dashboard'"
        @select="$emit('select-tab', tab.id)"
        @close="$emit('close-tab', tab.id)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import TabItem from './tab-item.vue';
import type { Tab } from '../../types';

defineProps<{
  tabs: Tab[];
  activeTabId: string;
}>();

defineEmits<{
  'select-tab': [tabId: string];
  'close-tab': [tabId: string];
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