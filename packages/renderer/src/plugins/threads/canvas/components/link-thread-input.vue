<template>
  <div class="flex flex-col w-full">
    <!-- Existing links as table -->
    <div v-if="values.length" class="mt-2" @dragend="handleDragEnd">
      <table class="w-full">
        <thead>
          <tr class="text-xs font-medium tracking-wider text-left uppercase border-b text-neutral-400 border-neutral-800">
            <th class="pl-2 pr-1 py-2 w-8"></th>
            <th class="px-3 py-2 w-24">Relation</th>
            <th class="px-6 py-2">Label</th>
            <th class="px-6 py-2">Tags</th>
            <th class="px-6 py-2">Status</th>
            <th class="px-6 py-2 text-right" v-if="!lite">Actions</th>
          </tr>
        </thead>
        <tbody>
          <BaseThreadRow
            v-for="item in values"
            :key="item.id"
            :thread="enrichedItem(item)"
            :available-tags="availableTags"
            :settings="settings"
            :class="getRowClass(item.id)"
            @select="emit('select', item.id)"
            @status-change="(id, status) => emit('status-change', id, status)"
            @drag-start="handleDragStart"
            @drag-over="handleDragOver"
            @drag-leave="handleDragLeave"
            @drop="handleDrop"
          >
            <template #prefix>
              <!-- Remove button -->
              <td class="pl-2 pr-1 py-1.5">
                <button
                  type="button"
                  @click="removeLink(item.id)"
                  class="p-1 rounded-md hover:bg-neutral-700 focus:outline-none transition-colors"
                >
                  <X :size="14" class="text-neutral-400 hover:text-neutral-200" />
                </button>
              </td>
              <!-- Relation badge -->
              <td class="px-3 py-1.5">
                <span class="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-md bg-neutral-800 border border-neutral-700 text-neutral-400">
                  {{ item.relation }}
                </span>
              </td>
            </template>
            <template #actions>
              <td v-if="!lite" class="px-6 py-1.5">
                <div class="flex items-center justify-end gap-2">
                  <button
                    @click.stop="emit('chat-click', item.id)"
                    type="button"
                    class="p-1.5 text-neutral-400 transition-all duration-200 rounded-md hover:text-blue-400 hover:bg-blue-400/10 active:scale-95"
                    aria-label="View chat"
                    title="View chat"
                  >
                    <MessageCircleMore class="w-4 h-4"/>
                  </button>
                </div>
              </td>
            </template>
          </BaseThreadRow>
        </tbody>
      </table>
    </div>

    <!-- Link Thread Input (toggled externally) -->
    <div v-if="isInputVisible" ref="inputSection" class="mt-2">
      <div class="flex items-center gap-2">
        <select v-model="relation" class="px-3 py-2 text-sm font-medium transition-all duration-200 border rounded-md bg-neutral-800 border-neutral-700 text-neutral-200 hover:bg-neutral-700 focus:outline-none focus:border-neutral-600">
          <option value="parent_of">parent_of</option>
          <option value="blocks">blocks</option>
          <option value="blocked_by">blocked_by</option>
          <option value="duplicates">duplicates</option>
        </select>

        <ComboboxRoot v-model="query" :open="isOpen" @update:open="isOpen = $event" class="relative flex-grow">
          <ComboboxAnchor class="inline-flex items-center flex-1 w-full gap-2 px-3 py-2 text-sm transition-all duration-200 border rounded-md bg-neutral-800 border-neutral-700 text-neutral-200 focus-within:border-neutral-600">
            <ComboboxInput
              placeholder="Search for threads"
              class="flex-1 w-full bg-transparent focus:outline-none placeholder:text-neutral-600"
              @click="isOpen = true"
              :display-value="displayThread"
              @keydown.backspace="query = ''"
            />
          </ComboboxAnchor>

          <ComboboxPortal>
            <ComboboxContent
              v-if="filteredOptions.length"
              position="popper"
              side="bottom"
              align="start"
              :side-offset="4"
              class="z-10 min-w-[300px] max-w-[600px] overflow-hidden border rounded-md shadow-lg bg-neutral-800 border-neutral-700"
            >
            <ComboboxViewport class="p-2 overflow-y-auto max-h-60">
              <ComboboxGroup>
                <ComboboxItem
                  v-for="thread in filteredOptions"
                  :key="thread.id"
                  :value="thread.id"
                  class="flex items-center gap-2 px-3 py-2 text-sm transition-colors rounded cursor-pointer text-neutral-200 hover:bg-neutral-700 data-[highlighted]:bg-neutral-700"
                >
                  <div class="flex items-center flex-1 space-x-2">
                    <span class="min-w-[5rem] text-xs font-medium uppercase tracking-wider text-neutral-500">
                      {{ thread.shortCode }}
                    </span>
                    <span class="text-sm truncate max-w-96 text-neutral-200 hover:text-neutral-100">
                      {{ thread.topic || 'Untitled thread...' }}
                    </span>
                  </div>
                </ComboboxItem>
              </ComboboxGroup>
            </ComboboxViewport>
            </ComboboxContent>
          </ComboboxPortal>
        </ComboboxRoot>

        <button
          type="button"
          @click="linkThread"
          class="flex items-center px-3 py-2 ml-2 text-sm font-medium text-white transition-colors bg-blue-600 rounded-md hover:bg-blue-700"
        >
          Link
        </button>
        <button
          type="button"
          @click="toggleInput"
          class="flex items-center px-3 py-2 text-sm font-medium transition-colors rounded-md text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, nextTick } from 'vue'
import {
  ComboboxAnchor,
  ComboboxContent,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxPortal,
  ComboboxRoot,
  ComboboxViewport,
} from 'reka-ui'
import { X, Plus, MessageCircleMore } from 'lucide-vue-next'
import type { ThreadLinkItem, ThreadLinkRelation, ThreadEntity, ThreadTagOption, ThreadsSettings } from '@app/api'
import { useThreadDragDrop } from '@/plugins/threads/composables/useThreadDragDrop'
import BaseThreadRow from './base-thread-row.vue'
import type { BaseThreadData } from './base-thread-row.vue'

const props = defineProps<{
  lite?: boolean
  modelValue: ThreadLinkItem[]
  availableThreads: Omit<ThreadLinkItem, 'relation'>[]
  availableTags?: ThreadTagOption[]
  settings?: ThreadsSettings | null
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', value: ThreadLinkItem[]): void
  (e: 'chat-click', id: string): void
  (e: 'select', id: string): void
  (e: 'status-change', id: string, status: ThreadEntity['status']): void
  (e: 'set-parent', childIds: string[], parentId: string): void
}>()

const isInputVisible = ref(false)
const isOpen = ref(false)
const query = ref('')
const relation = ref<ThreadLinkRelation>('parent_of')
const inputSection = ref<HTMLDivElement | null>(null)

// Drag-and-drop for reparenting between linked threads
const noSelection = ref<string[]>([])
const { handleDragStart, handleDragOver, handleDragLeave, handleDrop, handleDragEnd, getRowClass } = useThreadDragDrop({
  selectedItems: noSelection,
  onReparent: (childIds, parentId) => emit('set-parent', childIds, parentId)
})

const values = computed({
  get: () => {
    const relationOrder: Record<string, number> = {
      blocked_by: 0,
      blocks: 1,
      parent_of: 2,
      duplicates: 3
    }
    return [...props.modelValue].sort((a, b) => (relationOrder[a.relation] ?? 9) - (relationOrder[b.relation] ?? 9))
  },
  set: (val) => emit('update:modelValue', val),
})

const enrichedItem = (item: ThreadLinkItem): BaseThreadData => {
  const fullThread = props.availableThreads.find(t => t.id === item.id)
  return {
    id: item.id,
    topic: item.topic,
    shortCode: item.shortCode,
    status: item.status,
    tags: (fullThread as any)?.tags || [],
  }
}

const filteredOptions = computed(() => {
  return props.availableThreads
    .filter((thread) => {
      return (
        thread.shortCode?.toLowerCase().includes(query.value.toLowerCase()) &&
        !values.value.find((item) => item.id === thread.id)
      )
    })
})

function toggleInput() {
  isInputVisible.value = !isInputVisible.value
  query.value = ''
  if (isInputVisible.value) {
    nextTick(() => {
      inputSection.value?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  }
}

const displayThread = (id?: string) => {
  if (!id) return ''
  const t = props.availableThreads.find(th => th.id === id)
  return t ? `${t.shortCode}   ${t.topic}` : id
}

function linkThread() {
  const thread = props.availableThreads.find((t) => t.id === query.value)
  if (!thread) return
  const newLink: ThreadLinkItem = {
    id: thread.id,
    shortCode: thread.shortCode,
    status: thread.status,
    timestamp: thread.timestamp,
    topic: thread.topic,
    relation: relation.value
  }
  values.value = [...values.value, newLink]
  toggleInput()
}

function removeLink(id: string) {
  values.value = values.value.filter((v) => v.id !== id)
}

defineExpose({ toggleInput })
</script>
