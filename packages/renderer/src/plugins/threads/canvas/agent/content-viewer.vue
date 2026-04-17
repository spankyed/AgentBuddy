<template>
  <div class="flex h-full bg-neutral-900" data-onboarding-id="agent-artifacts">
    <!-- Artifact List (left side, integrated in tab) -->
    <div class="w-64 h-full overflow-y-auto border-r border-neutral-800 bg-neutral-900">
      <ArtifactList
        :artifacts="artifacts"
        :selectedArtifactId="selectedArtifactId"
        @select-artifact="$emit('select-artifact', $event)"
      />
    </div>

    <!-- Artifact Content (right side) -->
    <div class="flex-1 h-full p-6 overflow-auto bg-neutral-900">
      <div v-if="!selectedArtifact" class="flex flex-col items-center justify-center h-full gap-3">
        <FileText :size="32" class="text-neutral-700" />
        <p class="text-neutral-600 text-sm">No artifact selected</p>
      </div>
      <component
        v-else
        :is="getArtifactComponent(selectedArtifact.type)"
        :artifact="selectedArtifact"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { FileText } from 'lucide-vue-next';
import type { ArtifactItem } from '@app/api';
import ArtifactList from './artifacts/artifact-list.vue';
import TextArtifact from './artifacts/types/text-artifact.vue';
import CodeArtifact from './artifacts/types/code-artifact.vue';
import ReviewArtifact from './artifacts/types/review-artifact.vue';
import ImageArtifact from './artifacts/types/image-artifact.vue';
import SlackArtifact from './artifacts/types/slack-artifact.vue';
import TodoArtifact from './artifacts/types/todo-artifact.vue';
import ProjectArtifact from './artifacts/types/project-artifact.vue';
import JsonArtifact from './artifacts/types/json-artifact.vue';
import ClaudeSessionArtifact from './artifacts/types/claude-session-artifact.vue';
import DiffArtifact from './artifacts/types/diff-artifact.vue';
import PlanArtifact from './artifacts/types/plan-artifact.vue';
import BgProcessesArtifact from './artifacts/types/bg-processes-artifact.vue';

const props = defineProps<{
  artifacts: ArtifactItem[];
  selectedArtifactId?: string;
}>();

defineEmits<{
  'select-artifact': [artifactId: string];
}>();

const selectedArtifact = computed(() =>
  props.artifacts.find(a => a.id === props.selectedArtifactId)
);

function getArtifactComponent(type: string) {
  const components = {
    text: TextArtifact,
    code: CodeArtifact,
    review: ReviewArtifact,
    image: ImageArtifact,
    slack: SlackArtifact,
    todo: TodoArtifact,
    project: ProjectArtifact,
    json: JsonArtifact,
    'claude-session': ClaudeSessionArtifact,
    diff: DiffArtifact,
    plan: PlanArtifact,
    'bg-processes': BgProcessesArtifact,
  };
  return components[type as keyof typeof components] || TextArtifact;
}
</script>
