<template>
  <div class="flex flex-col h-full bg-neutral-900">
    <ThreadsHeader />
    <!-- Tab Bar -->
    <div class="flex items-center min-h-[37px] border-b border-neutral-800 bg-neutral-900" data-onboarding-id="agent-thread-tabs">
      <TabBar
        :tabs="tabs"
        :activeTabId="activeTabId"
        @select-tab="selectTab"
        @close-tab="closeTab"
      />
    </div>

    <!-- Content Viewer (includes artifact list) -->
    <ContentViewer
      :artifacts="currentTab?.artifacts || []"
      :selectedArtifactId="currentTab?.selectedArtifactId"
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

const actor: ThreadsState = applicationState.system.get(id);

const tabs = useSelector(actor, (state) => state.context.tabs);
const activeTabId = useSelector(actor, (state) => state.context.activeTabId);

const currentTab = computed(() => tabs.value.find(tab => tab.id === activeTabId.value));

function selectTab(tabId: string) {
  actor.send({ type: 'SELECT_TAB', tabId });
}

function closeTab(tabId: string) {
  actor.send({ type: 'CLOSE_TAB', tabId });
}

function selectArtifact(artifactId: string) {
  actor.send({ type: 'SELECT_ARTIFACT', artifactId });
}
</script>