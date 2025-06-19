<template>
  <div
    :class="[
      threadClass,
      { 'animate-highlight': !lite && thread.isNew },
    ]"
  >
    <div
      :class="threadContentClass"
      @click="$emit('select', thread.id)"
    >
      <!-- ID badge and truncated topic -->
      <div :class="layout.row('md')">
        <span :class="threadIdClass">
          {{ thread.shortCode }}
        </span>
        <span :class="threadTitleClass">
          {{ thread.topic || 'Untitled thread' }}
        </span>
      </div>
      
      <!-- Status selector and tags -->
      <div v-if="!lite" :class="layout.row('lg')">
        <select
          @click.stop
          :value="thread.status"
          @change="(e) => $emit('status-change', thread.id, (e.target as HTMLSelectElement).value as ThreadEntity['status'])"
          :class="components.input()"
          class="!px-3 !py-1 !text-xs cursor-pointer"
        >
          <option value="draft">Draft</option>
          <option value="queued">Queued</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        
        <div :class="layout.row('sm')" class="overflow-hidden max-w-[12rem]">
          <span
            v-for="tag in thread.tags"
            :key="tag.id"
            :class="components.badge('primary')"
            @click.stop
          >
            {{ tag.name }}
          </span>
        </div>
      </div>
    </div>

    <button
      v-if="!lite"
      @click.stop="$emit('chat-click', thread.id)"
      type="button"
      :class="chatButtonClass"
    >
      Chat
      <MessageCircleMore class="w-4 h-4 ml-1.5"/>
    </button>
  </div>
</template>

<script lang="ts">
export default {
  name: 'Thread'
}
</script>

<script setup lang="ts">
import { computed } from 'vue';
import { MessageCircleMore } from 'lucide-vue-next'
import type { ThreadListItem } from '@/plugins/threads/state';
import type { ThreadEntity } from '@abuddy/api';
import { useDesignSystem } from '@/core/design/useDesignSystem';

const props = defineProps<{
  lite?: boolean;
  thread: ThreadListItem
}>();

defineEmits<{
  select: [id: string]
  'status-change': [id: string, status: ThreadEntity['status']]
  'chat-click': [id: string]
}>();

// Use design system
const { 
  layout, 
  components, 
  colors, 
  textStyles, 
  tokens,
  interactive 
} = useDesignSystem();

// Computed classes using design system
const threadClass = computed(() => [
  layout.row('none'),
  'justify-between overflow-hidden',
  tokens.borderRadius.md,
  colors.background.secondary,
  `border ${colors.border.subtle}`,
  tokens.transitions.base,
  props.lite ? '' : `${interactive.clickable}`,
].join(' '));

const threadContentClass = computed(() => [
  layout.row('lg'),
  'flex-1 h-full px-4 py-2.5',
  props.lite ? '' : 'cursor-pointer',
].join(' '));

const threadIdClass = computed(() => 
  `${textStyles.label('uppercase')} min-w-[3.5rem]`
);

const threadTitleClass = computed(() => 
  `${textStyles.body()} truncate max-w-md`
);

const chatButtonClass = computed(() => [
  layout.row('none'),
  'justify-center h-full px-4 py-2.5',
  textStyles.body(),
  tokens.typography.fontWeight.medium,
  colors.text.muted,
  'hover:text-neutral-100',
  'hover:bg-neutral-800/50',
  tokens.transitions.base,
  'border-l',
  colors.border.default,
].join(' '));
</script>

<style lang="scss">
@keyframes highlight {
  0% {
    background-color: rgba(99, 102, 241, 0.15);
    border-color: rgba(99, 102, 241, 0.5);
  }
  100% {
    background-color: rgba(23, 23, 23, 0.4);
    border-color: rgba(38, 38, 38, 0.5);
  }
}

.animate-highlight {
  animation: highlight 2s ease-out forwards;
}
</style> 