<template>
  <div class="flex flex-col w-full gap-2">
    <!-- Link Thread Button / Input -->
    <div>
      <div v-if="!isInputVisible" class="flex gap-2">
        <button
          type="button"
          @click="toggleInput"
          class="flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors rounded-md text-neutral-300 bg-neutral-800 hover:bg-neutral-700 hover:text-neutral-100"
        >
          Link Thread
          <Plus :size="16" class="text-neutral-300" />
        </button>
        <slot name="extra-buttons"></slot>
      </div>

      <div v-else class="w-full gap-2 mt-2">
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

    <!-- Existing links -->
    <div v-if="values.length" class="flex flex-wrap gap-2 mt-2">
      <div v-for="item in values" class="flex items-center w-full gap-2">
        <button
          type="button"
          @click="removeLink(item.id)"
          class="p-1.5 rounded-md hover:bg-neutral-800 focus:outline-none transition-colors"
        >
          <X :size="16" class="text-neutral-400 hover:text-neutral-200" />
        </button>
        <span class="inline-flex items-center px-3 py-2 text-xs font-medium border rounded-md bg-neutral-800 border-neutral-700 text-neutral-300">{{ item.relation }}</span>
        <Thread
          :lite="lite"
          :key="item.id"
          :thread="threadAsListItem(item)"
          @chat-click="emit('chat-click', item.id)"
          @select="emit('select', item.id)"
          @status-change="(id, status) => emit('status-change', id, status)"
        />

      </div>
      <!-- <span
        v-for="item in values"
        :key="item.id"
        class="inline-flex items-center pl-3 py-0.5 text-sm bg-neutral-900/60 text-neutral-200 rounded"
      >
        {{ item.shortCode }}
        <button
          type="button"
          @click="removeLink(item.id)"
          class="p-1 ml-1 rounded focus:outline-none"
        >
          <X :size="16" class="text-neutral-400 hover:text-neutral-200" />
        </button>
      </span> -->
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  ComboboxAnchor,
  ComboboxContent,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxLabel,
  ComboboxPortal,
  ComboboxRoot,
  ComboboxTrigger,
  ComboboxViewport,
} from 'reka-ui'
import { X, Plus, Link as LinkIcon } from 'lucide-vue-next'
import type { EARS } from '@app/api'
import type { ThreadLinkItem, ThreadLinkRelation, ThreadExtended, ThreadEntity } from '@app/api'
import Thread from './list/thread.vue'
import type { ThreadListItem } from '../state'

const props = defineProps<{
  lite?: boolean
  modelValue: ThreadLinkItem[]
  availableThreads: Omit<ThreadLinkItem, 'relation'>[]
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', value: ThreadLinkItem[]): void
  (e: 'chat-click', id: string): void
  (e: 'select', id: string): void
  (e: 'status-change', id: string, status: ThreadEntity['status']): void
}>()

const isInputVisible = ref(false)
const isOpen = ref(false)
const query = ref('')
const relation = ref<ThreadLinkRelation>('parent_of')

const values = computed({
  get: () => {
    const relationOrder = {
      blocked_by: 0,
      blocks: 1,
      parent_of: 2,
      duplicates: 3
    }
    return [...props.modelValue].sort((a, b) => relationOrder[a.relation] - relationOrder[b.relation])
  },
  set: (val) => emit('update:modelValue', val),
})

const threadAsListItem = (thread: ThreadLinkItem) => {
  return {
    entityType: 'Thread' as EARS.Entity.Thread,
    instructions: '', // Default empty instructions since it's not available in ThreadLinkItem
    createdAt: thread.timestamp, // Use timestamp as createdAt since it's not available in ThreadLinkItem
    ...thread,
  } as ThreadListItem
}

const filteredOptions = computed(() => {
  const relationOrder = {
    blocked_by: 0,
    blocks: 1,
    parent_of: 2,
    duplicates: 3
  }
  
  return props.availableThreads
    .filter((thread) => {
      return (
        thread.shortCode?.toLowerCase().includes(query.value.toLowerCase()) &&
        !values.value.find((item) => item.id === thread.id)
      )
    })
    .sort((a, b) => relationOrder[relation.value] - relationOrder[relation.value])
})

function toggleInput() {
  isInputVisible.value = !isInputVisible.value
  query.value = ''
}


const displayThread = (id?: string) => {
  if (!id) return ''
  const t = props.availableThreads.find(th => th.id === id)
  return t ? `${t.shortCode}   ${t.topic}` : id          // fallback if not found
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
    threadType: thread.threadType,
    relation: relation.value
  }
  values.value = [...values.value, newLink]
  toggleInput()
}

function removeLink(id: string) {
  values.value = values.value.filter((v) => v.id !== id)
}
</script>
