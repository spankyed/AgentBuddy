<template>
  <div class="min-w-0 flex flex-col flex-shrink-0">
    <!-- Pinned row -->
    <div
      v-if="categorized.pinnedTabs.length > 0 || categorized.pinnedGroups.length > 0"
      ref="pinnedContainer"
      class="tab-container relative flex items-center overflow-x-auto overflow-y-visible border-b border-neutral-800"
      data-container="pinned"
      @dragover="handleDragOver"
      @drop="handleDrop"
      @dragleave="handleDragLeave"
      @wheel.prevent="(e: WheelEvent) => (e.currentTarget as HTMLElement).scrollLeft += e.deltaY"
    >
      <!-- Drop indicator for pinned -->
      <div
        v-if="dropPosition && isPinnedContext(dropPosition.context) && dropPosition.index !== null && draggedTab"
        class="absolute top-0 bottom-0 w-0.5 pointer-events-none z-50 transition-opacity bg-blue-500"
        :style="getDropIndicatorStyle()"
      ></div>

      <!-- Pinned groups -->
      <template v-for="{ group, tabs: groupTabs } in categorized.pinnedGroups" :key="group.id">
        <GroupLabel
          :group-id="group.id"
          :name="group.name"
          :color="group.color"
          :is-collapsed="group.isCollapsed"
          :is-pinned="true"
          :is-drag-over="dragOverGroupId === group.id"
          :tab-count="groupTabs.length"
          @toggle="$emit('toggle-group-collapse', group.id)"
          @rename="(name: string) => $emit('rename-group', group.id, name)"
          @change-color="(color: string) => $emit('change-group-color', group.id, color)"
          @ungroup-all="$emit('ungroup-all', group.id)"
          @close-all="$emit('close-all-in-group', group.id)"
          @pin-group="$emit('pin-group', group.id)"
          @unpin-group="$emit('unpin-group', group.id)"
          @group-drag-over="(e: DragEvent) => handleGroupDragOver(e, group.id)"
          @group-drag-leave="(e: DragEvent) => handleGroupDragLeave(e, group.id)"
          @group-drop="(e: DragEvent) => handleGroupDrop(e, group.id)"
        />
        <template v-if="!group.isCollapsed">
          <TabItem
            v-for="tab in groupTabs"
            :key="tab.id"
            :tab="tab"
            :isActive="tab.id === activeTabId"
            :isPinned="true"
            :groupId="group.id"
            :tabGroups="tabGroups"
            :isDragging="draggedTab?.id === tab.id"
            @select="$emit('select-tab', tab.id)"
            @close="$emit('close-tab', tab.id)"
            @edit-details="$emit('edit-details', tab.id)"
            @delete-thread="$emit('delete-thread', tab.id)"
            @archive-thread="$emit('archive-thread', tab.id)"
            @unpin-thread="$emit('unpin-thread', tab.id)"
            @pin-thread="$emit('pin-thread', tab.id)"
            @dragstart="handleDragStart(tab, $event)"
            @dragend="handleDragEnd"
            @add-to-group="(groupId: string) => $emit('add-tab-to-group', tab.id, groupId)"
            @remove-from-group="$emit('remove-tab-from-group', tab.id)"
            @create-group="$emit('create-group', [tab.id])"
          />
        </template>
      </template>

      <!-- Individual pinned tabs (no group) -->
      <TabItem
        v-for="tab in categorized.pinnedTabs"
        :key="tab.id"
        :tab="tab"
        :isActive="tab.id === activeTabId"
        :isPinned="true"
        :tabGroups="tabGroups"
        :isDragging="draggedTab?.id === tab.id"
        @select="$emit('select-tab', tab.id)"
        @close="$emit('close-tab', tab.id)"
        @edit-details="$emit('edit-details', tab.id)"
        @delete-thread="$emit('delete-thread', tab.id)"
        @archive-thread="$emit('archive-thread', tab.id)"
        @unpin-thread="$emit('unpin-thread', tab.id)"
        @pin-thread="$emit('pin-thread', tab.id)"
        @dragstart="handleDragStart(tab, $event)"
        @dragend="handleDragEnd"
        @add-to-group="(groupId: string) => $emit('add-tab-to-group', tab.id, groupId)"
        @remove-from-group="$emit('remove-tab-from-group', tab.id)"
        @create-group="$emit('create-group', [tab.id])"
      />
    </div>

    <!-- Main/unpinned row -->
    <div
      ref="mainContainer"
      class="tab-container relative flex items-center overflow-x-auto overflow-y-visible"
      data-container="main"
      @dragover="handleDragOver"
      @drop="handleDrop"
      @dragleave="handleDragLeave"
      @wheel.prevent="(e: WheelEvent) => (e.currentTarget as HTMLElement).scrollLeft += e.deltaY"
    >
      <!-- Drop indicator for main -->
      <div
        v-if="dropPosition && !isPinnedContext(dropPosition.context) && dropPosition.index !== null && draggedTab"
        class="absolute top-0 bottom-0 w-0.5 pointer-events-none z-50 transition-opacity bg-blue-500"
        :style="getDropIndicatorStyle()"
      ></div>

      <!-- Sorted unpinned groups -->
      <template v-for="[groupId, groupTabs] in sortedUnpinnedGroups" :key="groupId">
        <GroupLabel
          :group-id="groupId"
          :name="getGroup(groupId)!.name"
          :color="getGroup(groupId)!.color"
          :is-collapsed="getGroup(groupId)!.isCollapsed"
          :is-pinned="false"
          :is-drag-over="dragOverGroupId === groupId"
          :tab-count="groupTabs.length"
          @toggle="$emit('toggle-group-collapse', groupId)"
          @rename="(name: string) => $emit('rename-group', groupId, name)"
          @change-color="(color: string) => $emit('change-group-color', groupId, color)"
          @ungroup-all="$emit('ungroup-all', groupId)"
          @close-all="$emit('close-all-in-group', groupId)"
          @pin-group="$emit('pin-group', groupId)"
          @unpin-group="$emit('unpin-group', groupId)"
          @group-drag-over="(e: DragEvent) => handleGroupDragOver(e, groupId)"
          @group-drag-leave="(e: DragEvent) => handleGroupDragLeave(e, groupId)"
          @group-drop="(e: DragEvent) => handleGroupDrop(e, groupId)"
        />
        <template v-if="!getGroup(groupId)!.isCollapsed">
          <TabItem
            v-for="tab in groupTabs"
            :key="tab.id"
            :tab="tab"
            :isActive="tab.id === activeTabId"
            :isPinned="false"
            :groupId="groupId"
            :tabGroups="tabGroups"
            :isDragging="draggedTab?.id === tab.id"
            @select="$emit('select-tab', tab.id)"
            @close="$emit('close-tab', tab.id)"
            @edit-details="$emit('edit-details', tab.id)"
            @delete-thread="$emit('delete-thread', tab.id)"
            @archive-thread="$emit('archive-thread', tab.id)"
            @unpin-thread="$emit('unpin-thread', tab.id)"
            @pin-thread="$emit('pin-thread', tab.id)"
            @dragstart="handleDragStart(tab, $event)"
            @dragend="handleDragEnd"
            @add-to-group="(gId: string) => $emit('add-tab-to-group', tab.id, gId)"
            @remove-from-group="$emit('remove-tab-from-group', tab.id)"
            @create-group="$emit('create-group', [tab.id])"
          />
        </template>
      </template>

      <!-- Ungrouped tabs -->
      <TabItem
        v-for="tab in categorized.ungroupedTabs"
        :key="tab.id"
        :tab="tab"
        :isActive="tab.id === activeTabId"
        :isPinned="false"
        :tabGroups="tabGroups"
        :isDragging="draggedTab?.id === tab.id"
        @select="$emit('select-tab', tab.id)"
        @close="$emit('close-tab', tab.id)"
        @edit-details="$emit('edit-details', tab.id)"
        @delete-thread="$emit('delete-thread', tab.id)"
        @archive-thread="$emit('archive-thread', tab.id)"
        @unpin-thread="$emit('unpin-thread', tab.id)"
        @pin-thread="$emit('pin-thread', tab.id)"
        @dragstart="handleDragStart(tab, $event)"
        @dragend="handleDragEnd"
        @add-to-group="(groupId: string) => $emit('add-tab-to-group', tab.id, groupId)"
        @remove-from-group="$emit('remove-tab-from-group', tab.id)"
        @create-group="$emit('create-group', [tab.id])"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import TabItem from './tab-item.vue';
import GroupLabel from './group-label.vue';
import type { Tab } from '@app/api';
import type { ThreadTabGroup } from './types';
import { categorizeThreadTabs } from './tab-utils';
import { useTabDragDrop } from './useTabDragDrop';

const props = defineProps<{
  tabs: Tab[];
  activeTabId: string;
  tabGroups: ThreadTabGroup[];
}>();

const emit = defineEmits<{
  'select-tab': [tabId: string];
  'close-tab': [tabId: string];
  'edit-details': [tabId: string];
  'delete-thread': [tabId: string];
  'archive-thread': [tabId: string];
  'unpin-thread': [tabId: string];
  'pin-thread': [tabId: string];
  'reorder': [fromIndex: number, toIndex: number];
  'pin-tab-at': [tabId: string, targetTabId: string, side: 'left' | 'right'];
  'unpin-tab-at': [tabId: string, targetTabId: string, side: 'left' | 'right'];
  'create-group': [tabIds: string[]];
  'rename-group': [groupId: string, name: string];
  'change-group-color': [groupId: string, color: string];
  'delete-group': [groupId: string];
  'toggle-group-collapse': [groupId: string];
  'add-tab-to-group': [tabId: string, groupId: string];
  'remove-tab-from-group': [tabId: string];
  'ungroup-all': [groupId: string];
  'close-all-in-group': [groupId: string];
  'pin-group': [groupId: string];
  'unpin-group': [groupId: string];
}>();

const pinnedContainer = ref<HTMLElement | null>(null);
const mainContainer = ref<HTMLElement | null>(null);

const categorized = computed(() => categorizeThreadTabs(props.tabs, props.tabGroups));

const pinnedTabsComputed = computed(() => categorized.value.pinnedTabs);
const ungroupedTabsComputed = computed(() => categorized.value.ungroupedTabs);

const sortedUnpinnedGroups = computed(() => {
  const groups = props.tabGroups.filter(g => !g.isPinned).sort((a, b) => a.order - b.order);
  return groups.map(g => [g.id, categorized.value.groupedTabs.get(g.id) || []] as [string, Tab[]]);
});

function getGroup(groupId: string): ThreadTabGroup | undefined {
  return props.tabGroups.find(g => g.id === groupId);
}

function getTabsForGroup(groupId: string): Tab[] {
  return categorized.value.groupedTabs.get(groupId) || [];
}

function isPinnedContext(context: string): boolean {
  if (context === 'pinned') return true;
  const group = props.tabGroups.find(g => g.id === context);
  return group?.isPinned || false;
}

const {
  draggedTab,
  dropPosition,
  handleDragStart,
  handleDragOver,
  handleDrop,
  handleDragEnd,
  handleDragLeave,
  getDropIndicatorStyle,
} = useTabDragDrop({
  tabs: computed(() => props.tabs),
  pinnedTabs: pinnedTabsComputed,
  ungroupedTabs: ungroupedTabsComputed,
  getTabsForGroup,
  tabGroups: computed(() => props.tabGroups),
  pinnedContainer,
  mainContainer,
  onPinTab: (tabId) => emit('pin-thread', tabId),
  onUnpinTab: (tabId) => emit('unpin-thread', tabId),
  onPinTabAt: (tabId, targetTabId, side) => emit('pin-tab-at', tabId, targetTabId, side),
  onUnpinTabAt: (tabId, targetTabId, side) => emit('unpin-tab-at', tabId, targetTabId, side),
  onAddToGroup: (tabId, groupId) => emit('add-tab-to-group', tabId, groupId),
  onRemoveFromGroup: (tabId) => emit('remove-tab-from-group', tabId),
  onReorder: (from, to) => emit('reorder', from, to),
});

// Group drag-over state
const dragOverGroupId = ref<string | null>(null);

function handleGroupDragOver(event: DragEvent, groupId: string) {
  if (!draggedTab.value) return;
  event.preventDefault();
  event.dataTransfer!.dropEffect = 'move';
  dragOverGroupId.value = groupId;

  // Auto-expand collapsed group when dragging over it
  const group = getGroup(groupId);
  if (group?.isCollapsed) {
    emit('toggle-group-collapse', groupId);
  }

  // Set drop position to sentinel for empty group drop
  const groupTabs = getTabsForGroup(groupId);
  if (groupTabs.length === 0) {
    dropPosition.value = { index: -1, side: 'left', context: groupId };
  }
}

function handleGroupDragLeave(_event: DragEvent, groupId: string) {
  if (dragOverGroupId.value === groupId) {
    dragOverGroupId.value = null;
  }
}

function handleGroupDrop(event: DragEvent, groupId: string) {
  if (!draggedTab.value) return;
  event.preventDefault();
  dragOverGroupId.value = null;

  const sourceTab = props.tabs.find(t => t.id === draggedTab.value!.id);
  if (!sourceTab) return;

  // Add to group
  if (sourceTab.groupId !== groupId) {
    if (sourceTab.groupId) {
      emit('remove-tab-from-group', sourceTab.id);
    }
    emit('add-tab-to-group', sourceTab.id, groupId);
  }

  handleDragEnd();
}
</script>

<style>
/* Custom CSS variables for tab group colors */
:root {
  --color-blue: rgb(59, 130, 246);
  --color-blue-text: rgb(229, 231, 235);

  --color-purple: rgb(147, 51, 234);
  --color-purple-text: rgb(229, 231, 235);

  --color-pink: rgb(219, 39, 119);
  --color-pink-text: rgb(23, 23, 23);

  --color-red: rgb(239, 68, 68);
  --color-red-text: rgb(23, 23, 23);

  --color-orange: rgb(249, 115, 22);
  --color-orange-text: rgb(23, 23, 23);

  --color-yellow: rgb(202, 138, 4);
  --color-yellow-text: rgb(23, 23, 23);

  --color-green: rgb(34, 197, 94);
  --color-green-text: rgb(23, 23, 23);

  --color-teal: rgb(20, 184, 166);
  --color-teal-text: rgb(23, 23, 23);

  --color-gray: rgb(107, 114, 128);
  --color-gray-text: rgb(229, 231, 235);
}

/* Custom horizontal scrollbar for tab containers */
.tab-container::-webkit-scrollbar {
  height: 6px;
}
.tab-container::-webkit-scrollbar-track {
  background: transparent;
}
.tab-container::-webkit-scrollbar-thumb {
  background-color: rgba(100, 100, 100, 0.3);
  border-radius: 3px;
}
.tab-container::-webkit-scrollbar-thumb:hover {
  background-color: rgba(100, 100, 100, 0.5);
}
</style>
