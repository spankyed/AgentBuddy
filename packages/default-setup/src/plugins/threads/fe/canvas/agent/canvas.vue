<template>
  <div class="flex flex-col h-full bg-neutral-900">
    <template v-if="!inline">
      <ThreadsHeader />
      <!-- Tab Bar -->
      <div class="flex items-center border-b border-neutral-800 bg-neutral-900 overflow-hidden" data-onboarding-id="agent-thread-tabs">
        <TabBar :tabs="tabs" :activeTabId="activeTabId" :tabGroups="tabGroups" />
      </div>
    </template>

    <!-- Content Viewer (includes artifact list) — min-h-0 constrains flex
         child so inner overflow-auto scrolls instead of the outer canvas. -->
    <ContentViewer
      class="flex-1 min-h-0"
      :artifacts="currentTab?.artifacts || []"
      :selectedArtifactId="currentTab?.selectedArtifactId"
      :compact="inline"
      @select-artifact="(artifactId: string) => actor.send({ type: 'SELECT_ARTIFACT', artifactId })"
    />
  </div>
</template>

<script setup lang="ts">
import { useActorSystem } from '@abuddy/sdk/fe'
import { computed } from 'vue';
import { useSelector } from '@xstate/vue';
import { id, type ThreadsState } from '@/plugins/threads/fe/state';
import TabBar from '@/plugins/threads/fe/canvas/agent/tabs/tab-bar.vue';
import ContentViewer from '@/plugins/threads/fe/canvas/agent/content-viewer.vue';
import ThreadsHeader from '@/plugins/threads/fe/canvas/components/ThreadsHeader.vue';

const actorSystem = useActorSystem()

defineProps<{
  inline?: boolean;
}>();

const actor: ThreadsState = actorSystem.get(id);

const tabs = useSelector(actor, (state) => state.context.tabs);
const activeTabId = useSelector(actor, (state) => state.context.activeTabId);
const tabGroups = useSelector(actor, (state) => state.context.tabGroups);

const currentTab = computed(() => tabs.value.find(tab => tab.id === activeTabId.value));
</script>
