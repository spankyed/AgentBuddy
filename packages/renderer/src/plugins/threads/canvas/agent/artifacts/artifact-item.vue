<template>
  <div
    class="rounded-md cursor-pointer transition-colors shrink-0 whitespace-nowrap"
    :class="[
      compact ? 'px-1.5 py-1 max-w-48' : 'px-2.5 py-1.5',
      pillClasses
    ]"
    :title="artifact.title"
    @click="$emit('select')"
  >
    <div class="flex items-center gap-1.5" :class="{ 'gap-2': !compact }">
      <component :is="getIcon(artifact.type)" :size="compact ? 13 : 16" class="shrink-0" />
      <span class="font-medium truncate" :class="compact ? 'text-xs' : 'text-sm'">{{ artifact.title }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { FileText, Code, CheckSquare, Image, MessageSquare, ListTodo, Layers, GitBranch, Wrench, Network, Table, ClipboardList, BookText, StickyNote, Bot } from 'lucide-vue-next';
import type { ArtifactItem, ArtifactType } from '@app/api';

const props = defineProps<{
  artifact: ArtifactItem;
  isSelected: boolean;
  compact?: boolean;
}>();

defineEmits<{
  select: [];
}>();

const colorClasses: Record<string, { base: string; hover: string; text: string }> = {
  blue:    { base: 'bg-blue-500/15',    hover: 'hover:bg-blue-500/25',    text: 'text-blue-400' },
  purple:  { base: 'bg-purple-500/15',  hover: 'hover:bg-purple-500/25',  text: 'text-purple-400' },
  emerald: { base: 'bg-emerald-500/15', hover: 'hover:bg-emerald-500/25', text: 'text-emerald-400' },
  amber:   { base: 'bg-amber-500/15',   hover: 'hover:bg-amber-500/25',   text: 'text-amber-400' },
  red:     { base: 'bg-red-500/15',     hover: 'hover:bg-red-500/25',     text: 'text-red-400' },
  cyan:    { base: 'bg-cyan-500/15',    hover: 'hover:bg-cyan-500/25',    text: 'text-cyan-400' },
};

const pillClasses = computed(() => {
  if (props.isSelected) return 'bg-blue-600 text-white';
  const c = props.artifact.color && colorClasses[props.artifact.color];
  if (c) return `${c.base} ${c.text} ${c.hover}`;
  return 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700';
});

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
    'codex-session': Bot,
    diff: GitBranch,
    plan: ClipboardList,
    markdown: BookText,
    note: StickyNote,
  };
  return icons[type] || FileText;
}
</script>
