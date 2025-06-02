<template>
  <div class="flex flex-col w-full gap-2">
    <!-- horizontal rule -->
    <div class="w-full h-px my-2 bg-neutral-700/40"></div>
    <!-- Link Thread Button / Input -->
    <div>
      <button
        v-if="!isInputVisible"
        type="button"
        @click="toggleInput"
        class="flex items-center gap-2 px-4 py-4 text-sm font-medium transition-colors rounded h-7 text-neutral-200 bg-neutral-900/60 hover:bg-neutral-700"
      >
        Link Thread
        <Plus :size="16" class="text-neutral-300" />
      </button>

      <div v-else class="w-full gap-2 mt-2">
        <div class="flex items-center gap-2">
          <select v-model="relation" class="p-2 text-sm rounded bg-neutral-900/60 text-neutral-200 focus:outline-none">
            <option value="parent_of">parent_of</option>
            <option value="blocks">blocks</option>
            <option value="blocked_by">blocked_by</option>
            <option value="duplicates">duplicates</option>
          </select>

          <ComboboxRoot v-model="query" :open="isOpen" @update:open="isOpen = $event" class="relative flex-grow">
            <ComboboxAnchor class="inline-flex items-center flex-1 w-full gap-2 p-2 text-sm rounded bg-neutral-900/60 text-neutral-200 focus:outline-none">
              <ComboboxInput
                placeholder="Search for threads"
                class="flex-1 w-full px-4 bg-transparent focus:outline-none placeholder:text-neutral-500"
                @click="isOpen = true"
                :display-value="displayThread"
                @keydown.backspace="query = ''"
              />
            </ComboboxAnchor>
  
            <ComboboxContent
              v-if="filteredOptions.length"
              class="absolute z-10 w-full mt-0 overflow-hidden rounded shadow-lg bg-neutral-950"
            >
              <ComboboxViewport class="p-2 overflow-y-auto max-h-60">
                <ComboboxGroup>
                  <ComboboxItem
                    v-for="thread in filteredOptions"
                    :key="thread.id"
                    :value="thread.id"
                    class="flex items-center gap-2 px-2 py-1 text-sm rounded cursor-pointer text-neutral-200 hover:bg-neutral-700/40"
                  >
                    <div class="flex items-center flex-1 space-x-2">
                      <span class="w-20 px-2 py-1 text-xs font-semibold text-neutral-500">
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
          </ComboboxRoot>

          <button
            type="button"
            @click="linkThread"
            class="flex items-center px-3 py-1 ml-2 text-sm bg-blue-600 rounded text-neutral-200 hover:bg-blue-700"
          >
            Link
          </button>
          <button
            type="button"
            @click="toggleInput"
            class="flex items-center px-3 py-1 text-sm rounded text-neutral-200 hover:bg-neutral-600"
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
          class="p-1 rounded focus:outline-none"
        >
          <X :size="16" class="text-neutral-400 hover:text-neutral-200" />
        </button>
        <span class="w-24 h-10 px-3 py-2 text-sm rounded bg-neutral-900/60 text-neutral-200">{{ item.relation }}</span>
        <Thread
          :lite="lite"
          :key="item.id"
          :thread="item"
          @select="actor.send({ type: 'SELECT_THREAD', id: item.id })"
          @status-change="(id, status) => actor.send({ type: 'UPDATE_THREAD_STATUS', id, status })"
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
  ComboboxRoot,
  ComboboxTrigger,
  ComboboxViewport,
} from 'reka-ui'
import { X, Plus, Link as LinkIcon } from 'lucide-vue-next'
import type { ThreadLinkItem, ThreadLinkRelation, ThreadExtended } from '@abuddy/api'
import Thread from './list/thread.vue'

const props = defineProps<{
  lite?: boolean
  modelValue: ThreadLinkItem[]
  availableThreads: ThreadExtended[]
}>()
const emit = defineEmits<(e: 'update:modelValue', value: ThreadLinkItem[]) => void>()

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
        thread.shortCode.toLowerCase().includes(query.value.toLowerCase()) &&
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
    relation: relation.value,
  }
  values.value = [...values.value, newLink]
  toggleInput()
}

function removeLink(id: string) {
  values.value = values.value.filter((v) => v.id !== id)
}
</script>
