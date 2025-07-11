<template>
  <div class="flex flex-col h-full bg-neutral-950">
    <!-- Tab Bar -->
    <TabBar
      :tabs="tabs"
      :activeTabId="activeTabId"
      @select-tab="selectTab"
      @close-tab="closeTab"
    />
    
    <!-- Content Area -->
    <div class="flex flex-1 overflow-hidden">
      <!-- Artifact List -->
      <ArtifactList
        :artifacts="currentTab?.artifacts || []"
        :selectedArtifactId="currentTab?.selectedArtifactId"
        @select-artifact="selectArtifact"
      />
      
      <!-- Content Viewer -->
      <ContentViewer
        :artifact="selectedArtifact"
      />
    </div>
    
    <!-- Test button for opening thread tabs -->
    <div class="absolute bottom-4 right-4 z-10">
      <button
        @click="openTestThread"
        class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm"
      >
        Open Test Thread Tab
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { applicationState } from '@/app';
import { useSelector } from '@xstate/vue';
import { id, type AgentState } from '@/plugins/agent/state';
import { trpc } from '@/core/trpc';
import TabBar from './canvas/components/tabs/tab-bar.vue';
import ArtifactList from './canvas/components/artifacts/artifact-list.vue';
import ContentViewer from './canvas/components/content-viewer.vue';
import type { Tab } from './canvas/types';

const actor: AgentState = applicationState.system.get(id);

const tabs = useSelector(actor, (state) => state.context.tabs);
const activeTabId = useSelector(actor, (state) => state.context.activeTabId);

const currentTab = computed(() => tabs.value.find(tab => tab.id === activeTabId.value));
const selectedArtifact = computed(() => 
  currentTab.value?.artifacts.find(a => a.id === currentTab.value?.selectedArtifactId)
);

function selectTab(tabId: string) {
  actor.send({ type: 'SELECT_TAB', tabId });
}

function closeTab(tabId: string) {
  actor.send({ type: 'CLOSE_TAB', tabId });
}

function selectArtifact(artifactId: string) {
  actor.send({ type: 'SELECT_ARTIFACT', artifactId });
}

function openTestThread() {
  // Send request to backend to open a thread tab
  trpc.bus.send.mutate({
    systemId: id,
    type: 'OPEN_THREAD_TAB',
    threadId: 'Thread-1',
    label: 'UI Layout Reorganization'
  });
}
</script>