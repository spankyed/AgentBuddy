<template>
  <div class="flex flex-col h-full bg-neutral-900">
    <template v-if="!inline">
      <ThreadsHeader />
      <!-- Tab Bar -->
      <div class="flex items-center border-b border-neutral-800 bg-neutral-900 overflow-hidden" data-onboarding-id="agent-thread-tabs">
        <TabBar
          :tabs="tabs"
          :activeTabId="activeTabId"
          :tabGroups="tabGroups"
          @select-tab="selectTab"
          @close-tab="closeTab"
          @edit-details="editDetails"
          @delete-thread="deleteThread"
          @archive-thread="archiveThread"
          @unpin-thread="unpinThread"
          @pin-thread="pinThread"
          @reorder="reorderTabs"
          @pin-tab-at="pinTabAt"
          @unpin-tab-at="unpinTabAt"
          @create-group="createGroup"
          @rename-group="renameGroup"
          @change-group-color="changeGroupColor"
          @delete-group="deleteGroup"
          @toggle-group-collapse="toggleGroupCollapse"
          @add-tab-to-group="addTabToGroup"
          @remove-tab-from-group="removeTabFromGroup"
          @ungroup-all="ungroupAll"
          @close-all-in-group="closeAllInGroup"
          @pin-group="pinGroup"
          @unpin-group="unpinGroup"
        />
      </div>
    </template>

    <!-- Content Viewer (includes artifact list) — min-h-0 constrains flex
         child so inner overflow-auto scrolls instead of the outer canvas. -->
    <ContentViewer
      class="flex-1 min-h-0"
      :artifacts="currentTab?.artifacts || []"
      :selectedArtifactId="currentTab?.selectedArtifactId"
      :compact="inline"
      @select-artifact="selectArtifact"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { applicationState } from '@/main';
import { useSelector } from '@xstate/vue';
import { id, type ThreadsState } from '@/plugins/threads/state';
import TabBar from '@/plugins/threads/canvas/agent/tabs/tab-bar.vue';
import ContentViewer from '@/plugins/threads/canvas/agent/content-viewer.vue';
import ThreadsHeader from '@/plugins/threads/canvas/components/ThreadsHeader.vue';

defineProps<{
  inline?: boolean;
}>();

const actor: ThreadsState = applicationState.system.get(id);

const tabs = useSelector(actor, (state) => state.context.tabs);
const activeTabId = useSelector(actor, (state) => state.context.activeTabId);
const tabGroups = useSelector(actor, (state) => state.context.tabGroups);

const currentTab = computed(() => tabs.value.find(tab => tab.id === activeTabId.value));

function selectTab(tabId: string) {
  actor.send({ type: 'SELECT_TAB', tabId });
  actor.send({ type: 'OPEN_THREAD_CHAT', threadId: tabId });
}

function closeTab(tabId: string) {
  actor.send({ type: 'CLOSE_TAB', tabId });
}

function editDetails(tabId: string) {
  actor.send({ type: 'SELECT_THREAD', id: tabId });
}

function archiveThread(tabId: string) {
  actor.send({ type: 'ARCHIVE_THREAD', threadId: tabId });
}

function deleteThread(tabId: string) {
  actor.send({ type: 'DELETE_THREAD', threadId: tabId });
}

function unpinThread(tabId: string) {
  actor.send({ type: 'UNPIN_THREAD', threadId: tabId });
}

function pinThread(tabId: string) {
  actor.send({ type: 'PIN_THREAD', threadId: tabId });
}

function selectArtifact(artifactId: string) {
  actor.send({ type: 'SELECT_ARTIFACT', artifactId });
}

// Tab reorder & group events
function reorderTabs(fromIndex: number, toIndex: number) {
  actor.send({ type: 'REORDER_TABS', fromIndex, toIndex });
}

function pinTabAt(tabId: string, targetTabId: string, side: 'left' | 'right') {
  actor.send({ type: 'PIN_TAB_AT', tabId, targetTabId, side });
}

function unpinTabAt(tabId: string, targetTabId: string, side: 'left' | 'right') {
  actor.send({ type: 'UNPIN_TAB_AT', tabId, targetTabId, side });
}

function createGroup(tabIds: string[]) {
  actor.send({ type: 'CREATE_TAB_GROUP', tabIds });
}

function renameGroup(groupId: string, name: string) {
  actor.send({ type: 'RENAME_TAB_GROUP', groupId, name });
}

function changeGroupColor(groupId: string, color: string) {
  actor.send({ type: 'CHANGE_TAB_GROUP_COLOR', groupId, color: color as import('@/plugins/threads/canvas/agent/tabs/types').TabGroupColor });
}

function deleteGroup(groupId: string) {
  actor.send({ type: 'DELETE_TAB_GROUP', groupId });
}

function toggleGroupCollapse(groupId: string) {
  actor.send({ type: 'TOGGLE_TAB_GROUP_COLLAPSE', groupId });
}

function addTabToGroup(tabId: string, groupId: string) {
  actor.send({ type: 'ADD_TAB_TO_GROUP', tabId, groupId });
}

function removeTabFromGroup(tabId: string) {
  actor.send({ type: 'REMOVE_TAB_FROM_GROUP', tabId });
}

function ungroupAll(groupId: string) {
  actor.send({ type: 'UNGROUP_ALL_IN_GROUP', groupId });
}

function closeAllInGroup(groupId: string) {
  actor.send({ type: 'CLOSE_ALL_IN_GROUP', groupId });
}

function pinGroup(groupId: string) {
  actor.send({ type: 'PIN_TAB_GROUP', groupId });
}

function unpinGroup(groupId: string) {
  actor.send({ type: 'UNPIN_TAB_GROUP', groupId });
}
</script>
