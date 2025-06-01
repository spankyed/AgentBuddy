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

const props = defineProps<{
  modelValue: ThreadLinkItem[]
  availableThreads: ThreadExtended[]
}>()
const emit = defineEmits<(e: 'update:modelValue', value: ThreadLinkItem[]) => void>()

const isInputVisible = ref(false)
const query = ref('')
const relation: { value: ThreadLinkRelation } = ref('blocks' as ThreadLinkRelation)

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

function linkThread(thread: ThreadExtended) {
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

<template>
  <div class="flex flex-col w-full gap-2">
    <!-- Existing links -->
    <div v-if="values.length" class="flex flex-wrap gap-2">
      <span
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
      </span>
    </div>

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

      <div v-else class="flex items-center w-full gap-2">
        <ComboboxRoot v-model="query" class="relative flex-1">
          <ComboboxAnchor class="inline-flex items-center flex-1 gap-2 p-2 text-sm rounded bg-neutral-900/60 text-neutral-200 focus:outline-none">
            <LinkIcon :size="16" class="text-neutral-400" />
            <ComboboxInput
              placeholder="Search thread short code..."
              class="flex-1 bg-transparent focus:outline-none placeholder:text-neutral-500"
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
                  @click="linkThread(thread)"
                >
                  {{ thread.shortCode }} - {{ thread.topic }}
                </ComboboxItem>
              </ComboboxGroup>
            </ComboboxViewport>
          </ComboboxContent>
        </ComboboxRoot>

        <select v-model="relation.value" class="px-2 py-1 text-sm rounded bg-neutral-900/60 text-neutral-200 focus:outline-none">
          <option value="parent_of">parent_of</option>
          <option value="blocks">blocks</option>
          <option value="blocked_by">blocked_by</option>
          <option value="duplicates">duplicates</option>
        </select>

        <button
          type="button"
          @click="toggleInput"
          class="px-3 py-1 text-sm rounded bg-neutral-700 text-neutral-200"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
</template>
