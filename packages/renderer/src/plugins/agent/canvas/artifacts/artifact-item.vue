<template>
  <div
    class="p-3 rounded-lg cursor-pointer transition-colors"
    :class="[
      isSelected 
        ? 'bg-blue-600 text-white' 
        : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
    ]"
    @click="$emit('select')"
  >
    <div class="flex items-center space-x-2">
      <component :is="getIcon(artifact.type)" :size="16" />
      <span class="text-sm font-medium truncate">{{ artifact.title }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { FileText, Code, CheckSquare, Image, LayoutDashboard, MessageSquare, ListTodo } from 'lucide-vue-next';
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
    kanban: LayoutDashboard,
    slack: MessageSquare,
    todo: ListTodo,
  };
  return icons[type] || FileText;
}
</script>