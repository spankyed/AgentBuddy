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
        class="flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors rounded h-7 text-neutral-200 bg-neutral-900/60 hover:bg-neutral-700"
      >
        Link Thread
        <Plus :size="16" class="text-neutral-300" />
      </button>

      <div v-else class="w-full gap-2 mt-2">
        <div class="flex justify-start mb-2">
          <button
            type="button"
            @click="linkThread"
            class="px-3 py-1 text-sm rounded bg-neutral-700 text-neutral-200"
          >
            Link
          </button>
          <button
            type="button"
            @click="toggleInput"
            class="px-3 py-1 text-sm rounded text-neutral-200"
          >
            Cancel
          </button>
        </div>
        <div class="flex items-center gap-2">
          <select v-model="relation.value" class="p-2 text-sm rounded bg-neutral-900/60 text-neutral-200 focus:outline-none">
            <option value="parent_of">parent_of</option>
            <option value="blocks">blocks</option>
            <option value="blocked_by">blocked_by</option>
            <option value="duplicates">duplicates</option>
          </select>

          <ComboboxRoot v-model="query" class="relative flex-grow">
            <ComboboxAnchor class="inline-flex items-center flex-1 w-full gap-2 p-2 text-sm rounded bg-neutral-900/60 text-neutral-200 focus:outline-none">
              <ComboboxInput
                placeholder="Search for threads"
                class="flex-1 w-full px-4 bg-transparent focus:outline-none placeholder:text-neutral-500"
              />
            </ComboboxAnchor>
  
            <ComboboxContent v-if="filteredOptions.length" class="absolute z-10 w-full mt-0 overflow-hidden rounded shadow-lg bg-neutral-800">
              <ComboboxViewport class="p-2 overflow-y-auto max-h-60">
                <ComboboxGroup>
                  <ComboboxItem
                    v-for="thread in filteredOptions"
                    :key="thread.id"
                    :value="thread.shortCode"
                    class="flex items-center gap-2 px-2 py-1 text-sm rounded cursor-pointer text-neutral-200 hover:bg-purple-900/40"
                  >
                    {{ thread.shortCode }} - {{ thread.topic }}
                  </ComboboxItem>
                </ComboboxGroup>
              </ComboboxViewport>
            </ComboboxContent>
          </ComboboxRoot>
        </div>
      </div>
    </div>

    <!-- Existing links -->
    <div v-if="values.length" class="flex flex-wrap gap-2">
      <div v-for="item in values" class="flex items-center w-full gap-2">
                <button
          type="button"
          @click="removeLink(item.id)"
          class="p-1 rounded focus:outline-none"
        >
          <X :size="16" class="text-neutral-400 hover:text-neutral-200" />
        </button>
        <span class="p-3 text-sm rounded bg-neutral-900/60 text-neutral-200">{{ item.relation }}</span>
        <Thread
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
  modelValue: ThreadLinkItem[]
  availableThreads: ThreadExtended[]
}>()
const emit = defineEmits<(e: 'update:modelValue', value: ThreadLinkItem[]) => void>()

const isInputVisible = ref(false)
const query = ref('')
const relation: { value: ThreadLinkRelation } = ref('parent_of' as ThreadLinkRelation)

const values = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})

const filteredOptions = computed(() =>
  props.availableThreads.filter((thread) => {
    return (
      thread.shortCode.toLowerCase().includes(query.value.toLowerCase()) &&
      !values.value.find((item) => item.id === thread.id)
    )
  })
)

function toggleInput() {
  isInputVisible.value = !isInputVisible.value
  query.value = ''
}

function linkThread() {
  const thread = filteredOptions.value.find((thread) => thread.shortCode === query.value)
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
