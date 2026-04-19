<template>
  <tr
    draggable="true"
    class="transition-all duration-200 hover:bg-neutral-800"
    @dragstart="$emit('drag-start', $event, thread.id)"
    @dragover="$emit('drag-over', $event, thread.id)"
    @dragleave="$emit('drag-leave', $event)"
    @drop="$emit('drop', $event, thread.id)"
  >
    <slot name="prefix" />

    <!-- Label: status dot + topic -->
    <td class="px-6 py-1.5">
      <div class="flex items-center gap-2.5">
        <!-- Status indicator dot -->
        <span class="shrink-0 relative inline-flex items-center justify-center w-2 h-2">
          <span
            class="block w-full h-full rounded-full transition-colors"
            :class="isThreadBusy(thread.id) ? $style['mosaic-dot'] : ''"
            :style="!isThreadBusy(thread.id) ? { backgroundColor: getThreadDotColor(thread.id) || '#525252' } : undefined"
          />
          <span
            v-if="isThreadBusy(thread.id)"
            class="absolute inset-0 rounded-full scale-[2]"
            :class="$style['mosaic-glow']"
          />
        </span>
        <span
          class="text-sm font-medium text-neutral-100 line-clamp-1 hover:underline hover:text-blue-400 transition-colors cursor-pointer"
          :title="thread.topic || 'Untitled thread'"
          @click.stop="$emit('select', thread.id)"
        >
          {{ thread.topic || 'Untitled thread' }}
        </span>
      </div>
    </td>

    <!-- Tags -->
    <td class="px-6 py-1.5">
      <div class="flex items-center gap-2">
        <span
          v-for="(tag, index) in (thread.tags || []).slice(0, 3)"
          :key="index"
          :style="getTagStyles(tag)"
          :title="tag"
          class="inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-md max-w-[6rem]"
        >
          <span class="truncate">{{ tag }}</span>
        </span>
        <span v-if="thread.tags && thread.tags.length > 3" class="px-2 py-0.5 text-xs text-neutral-400">
          +{{ thread.tags.length - 3 }} more
        </span>
      </div>
    </td>

    <!-- Status -->
    <td class="px-6 py-1.5">
      <select
        @click.stop
        :value="thread.status"
        @change="(e) => $emit('status-change', thread.id, (e.target as HTMLSelectElement).value)"
        class="px-2.5 py-1 text-xs font-medium rounded-md cursor-pointer bg-neutral-800 border border-neutral-700 text-neutral-300 hover:bg-neutral-700 focus:outline-none focus:border-neutral-600 transition-all duration-200 appearance-none"
      >
        <option
          v-for="status in (settings?.statuses || [])"
          :key="status.label"
          :value="status.label"
          class="bg-neutral-800 text-neutral-300"
        >
          {{ status.label }}
        </option>
      </select>
    </td>

    <slot name="actions" />
  </tr>
</template>

<script setup lang="ts">
import type { ThreadTagOption, ThreadsSettings } from '@app/api'

export interface BaseThreadData {
  id: string
  topic?: string
  shortCode?: string
  status?: string
  tags?: string[]
}

const props = defineProps<{
  thread: BaseThreadData
  availableTags?: ThreadTagOption[]
  settings?: ThreadsSettings | null
  chatStates?: Record<string, string>
  chatStateOverrides?: Record<string, { id: string; expiresAt: number }>
}>()

defineEmits<{
  select: [id: string]
  'status-change': [id: string, status: string]
  'drag-start': [e: DragEvent, id: string]
  'drag-over': [e: DragEvent, id: string]
  'drag-leave': [e: DragEvent]
  'drop': [e: DragEvent, id: string]
}>()

const getTagStyles = (tagName: string) => {
  const color = props.availableTags?.find(t => t.name === tagName)?.color || '#A855F7'
  return {
    backgroundColor: `${color}1A`,
    color,
    border: `1px solid ${color}33`
  }
}

function getThreadStateConfig(threadId: string) {
  const override = props.chatStateOverrides?.[threadId]
  const activeStateId = (override && override.expiresAt > Date.now())
    ? override.id
    : (props.chatStates?.[threadId] || 'idle')
  return props.settings?.chatStates?.find(c => c.id === activeStateId)
}

function getThreadDotColor(threadId: string): string | undefined {
  return getThreadStateConfig(threadId)?.color
}

function isThreadBusy(threadId: string): boolean {
  return getThreadStateConfig(threadId)?.busy ?? false
}
</script>

<style lang="scss" module>
.mosaic-dot {
  background: conic-gradient(
    from var(--thinking-angle, 0deg),
    #facc15,
    #a855f7,
    #3b82f6,
    #facc15
  );
  animation: thinking-rotate 3s linear infinite;
  filter: saturate(1.5) brightness(1.2);
}

.mosaic-glow {
  background: conic-gradient(
    from var(--thinking-angle, 0deg),
    #facc15,
    #a855f7,
    #3b82f6,
    #facc15
  );
  animation: thinking-rotate 3s linear infinite;
  filter: blur(3px) saturate(2) brightness(1.3);
  opacity: 0.7;
}

@keyframes thinking-rotate {
  to {
    --thinking-angle: 360deg;
  }
}
</style>

<style>
@property --thinking-angle {
  syntax: '<angle>';
  initial-value: 0deg;
  inherits: false;
}
</style>
