<template>
  <div
    class="rounded-md cursor-pointer transition-colors"
    :class="[
      compact ? 'px-1.5 py-1' : 'px-2.5 py-1.5',
      isSelected ? 'bg-blue-600 text-white' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
    ]"
    @click="$emit('select')"
  >
    <div class="flex items-center gap-1.5" :class="{ 'gap-2': !compact }">
      <component :is="getIcon(artifact.type)" :size="compact ? 13 : 16" class="shrink-0" />
      <span class="font-medium truncate" :class="compact ? 'text-xs' : 'text-sm'">{{ artifact.title }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { FileText, Code, CheckSquare, Image, MessageSquare, ListTodo, Layers, GitBranch, Wrench, Network, Table, ClipboardList, BookText } from 'lucide-vue-next';
import type { ArtifactItem, ArtifactType } from '@app/api';

defineProps<{
  artifact: ArtifactItem;
  isSelected: boolean;
  compact?: boolean;
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
    markdown: BookText,
  };
  return icons[type] || FileText;
}
</script>