<template>
  <div
    class="px-2.5 py-1.5 rounded-md cursor-pointer transition-colors"
    :class="[
      isSelected 
        ? 'bg-blue-600 text-white' 
        : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
    ]"
    @click="$emit('select')"
  >
    <div class="flex items-center space-x-2">
      <component :is="getIcon(artifact.type)" :size="16" class="shrink-0 w-4 h-4" />
      <span class="text-sm font-medium truncate">{{ artifact.title }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { FileText, Code, CheckSquare, Image, MessageSquare, ListTodo, Layers, GitBranch, Wrench, Network, Table, ClipboardList } from 'lucide-vue-next';
import type { ArtifactItem, ArtifactType } from '@app/api';

defineProps<{
  artifact: ArtifactItem;
  isSelected: boolean;
}>();

defineEmits<{
  select: [];
}>();

function getIcon(type: ArtifactType) {
  const icons: Record<ArtifactType, any> = {
    text: FileText,
    code: Code,
    review: CheckSquare,
    image: Image,
    slack: MessageSquare,
    todo: ListTodo,
    project: Layers,
    json: FileText,
    graph: Network,
    table: Table,
    'claude-session': Wrench,
    diff: GitBranch,
    plan: ClipboardList,
  };
  return icons[type] || FileText;
}
</script>