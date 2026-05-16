<template>
  <div class="min-w-0">
    <!-- Pinned row -->
    <div v-if="pinnedTabs.length" class="flex overflow-x-auto border-b border-neutral-800" @wheel.prevent="(e: WheelEvent) => (e.currentTarget as HTMLElement).scrollLeft += e.deltaY">
      <TabItem
        v-for="tab in pinnedTabs"
        :key="tab.id"
        :tab="tab"
        :isActive="tab.id === activeTabId"
        :isPinned="true"
        @select="$emit('select-tab', tab.id)"
        @close="$emit('close-tab', tab.id)"
        @edit-details="$emit('edit-details', tab.id)"
        @delete-thread="$emit('delete-thread', tab.id)"
        @archive-thread="$emit('archive-thread', tab.id)"
        @unpin-thread="$emit('unpin-thread', tab.id)"
        @pin-thread="$emit('pin-thread', tab.id)"
      />
    </div>
    <!-- Unpinned row -->
    <div class="flex overflow-x-auto" @wheel.prevent="(e: WheelEvent) => (e.currentTarget as HTMLElement).scrollLeft += e.deltaY">
      <TabItem
        v-for="tab in unpinnedTabs"
        :key="tab.id"
        :tab="tab"
        :isActive="tab.id === activeTabId"
        :isPinned="false"
        @select="$emit('select-tab', tab.id)"
        @close="$emit('close-tab', tab.id)"
        @edit-details="$emit('edit-details', tab.id)"
        @delete-thread="$emit('delete-thread', tab.id)"
        @archive-thread="$emit('archive-thread', tab.id)"
        @unpin-thread="$emit('unpin-thread', tab.id)"
        @pin-thread="$emit('pin-thread', tab.id)"
      />
    </div>
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

const pinnedTabs = computed(() => props.tabs.filter(t => t.pinned));
const unpinnedTabs = computed(() => props.tabs.filter(t => !t.pinned));

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
