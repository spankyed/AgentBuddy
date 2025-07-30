<template>
  <div class="flex h-full bg-neutral-900">
    <!-- Artifacts Panel (Full Height) -->
    <div class="w-64 h-full overflow-y-auto border-r border-neutral-800 bg-neutral-900">
      <ArtifactList
        :artifacts="currentTab?.artifacts || []"
        :selectedArtifactId="currentTab?.selectedArtifactId"
        @select-artifact="selectArtifact"
      />
    </div>

    <!-- Main Content Area -->
    <div class="flex flex-col flex-1 h-full">
      <!-- Tab Bar -->
      <div class="flex items-center border-b border-neutral-800 bg-neutral-900">
        <TabBar
          :tabs="tabs"
          :activeTabId="activeTabId"
          @select-tab="selectTab"
          @close-tab="closeTab"
        />
      </div>
      
      <!-- Content Viewer -->
      <ContentViewer
        :artifact="selectedArtifact"
      />
    </div>
    
    <!-- Test button for opening thread tabs -->
    <div class="absolute z-10 bottom-4 right-4">
      <button
        @click="openTestThread"
        class="px-4 py-2 text-sm text-white transition-colors bg-blue-600 rounded hover:bg-blue-700"
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
import TabBar from '@/plugins/agent/canvas/tabs/tab-bar.vue';
import ArtifactList from '@/plugins/agent/canvas/artifacts/artifact-list.vue';
import ContentViewer from '@/plugins/agent/canvas/content-viewer.vue';

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