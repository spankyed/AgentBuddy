<template>
  <div class="flex flex-col h-full bg-neutral-900">
    <template v-if="!inline">
      <ThreadsHeader />
      <!-- Tab Bar -->
      <div class="flex items-center min-h-[37px] border-b border-neutral-800 bg-neutral-900 overflow-hidden" data-onboarding-id="agent-thread-tabs">
        <TabBar
          :tabs="tabs"
          :activeTabId="activeTabId"
          @select-tab="selectTab"
          @close-tab="closeTab"
          @open-in-chat="openInChat"
          @delete-thread="deleteThread"
          @unpin-thread="unpinThread"
          @pin-thread="pinThread"
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

const currentTab = computed(() => tabs.value.find(tab => tab.id === activeTabId.value));

function selectTab(tabId: string) {
  actor.send({ type: 'SELECT_TAB', tabId });
  actor.send({ type: 'OPEN_THREAD_CHAT', threadId: tabId });
}

function closeTab(tabId: string) {
  actor.send({ type: 'CLOSE_TAB', tabId });
}

function openInChat(tabId: string) {
  actor.send({ type: 'OPEN_THREAD_CHAT', threadId: tabId });
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
</script>