<template>
  <Create v-if="showCreateForm" />
  <div v-else class="max-w-5xl px-6 py-4 mx-auto space-y-6">
    <!-- Search & Create row -->
    <div class="flex flex-col gap-4 md:flex-row md:items-center md:gap-6">
      <button
        @click="showCreateForm = true"
        type="button"
        class="px-4 py-2 text-sm font-medium text-white rounded bg-primary-600 hover:bg-primary-500"
      >
        Create
      </button>
      <div class="flex justify-end flex-1 gap-4 text-sm">
        <!-- <button type="button" class="text-primary-400 hover:underline">Advanced Search</button> -->
        <button type="button" class="text-primary-400 hover:underline">Filter</button>
      </div>
      <div class="flex justify-end">
        <!-- Search input -->
        <input
          v-model="searchKeyword"
          type="text"
          placeholder="Search"
          class="px-4 py-2 text-sm border rounded-tl rounded-bl w-96 bg-neutral-900 border-neutral-700 placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-primary-600"
        />
        <button
          type="button"
          class="px-4 py-2 text-sm font-medium text-white rounded-tr rounded-br bg-neutral-700 hover:bg-neutral-600"
        >
          <Search :size="16" class="text-neutral-500" />
        </button>
      </div>


    </div>

    <!-- Threads list section -->
    <div class="space-y-2">
      <div
        v-for="thread in threads"
        :key="thread"
        class="flex items-center justify-between px-4 py-2 border rounded-lg bg-neutral-800 border-neutral-700"
      >
        <span class="text-sm text-neutral-200">{{ thread || 'Untitled detail' }}</span>
        <ChevronRight :size="16" class="text-neutral-500" />
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import Create from './save/create.vue'
import { Mic, ChevronRight, Search } from 'lucide-vue-next'
import { applicationActor } from '@/application'
import { useSelector } from '@xstate/vue'
import { id as agentId } from '@/plugins/agent/state'

// Silences unused import warnings for icon components (used in template)
void Mic
void ChevronRight

// Snapshot typing – cast from unknown to expected shape
const actor = applicationActor.system.get(agentId)
// biome-ignore lint/suspicious/noExplicitAny: We cast unknown snapshot to expected context shape
const actions = useSelector(actor, (snapshot) => (snapshot as { context: { actions: { id: string; description: string; status: string }[] } }).context.actions)

// Local state for form inputs
const searchKeyword = ref('')
const showCreateForm = ref(false)
const title = ref('Project X')
const status = ref('Active')
const threads = ref<string[]>(['USER-182', 'PROJ-13', 'AGENT-7'])

const addDetail = () => {
  threads.value.push('')
}

function actionButtonClass(status: string) {
  switch (status) {
    case 'completed':
      return 'bg-neutral-700 text-white border-neutral-700 hover:bg-neutral-600'
    case 'in-progress':
      return 'bg-primary-700 text-white border-primary-700 hover:bg-primary-600'
    default:
      return 'bg-neutral-800 text-neutral-400 border-neutral-800 hover:bg-neutral-700'
  }
}
</script>

<style lang="scss" module>
/********************
Scoped styles can be added here if needed. Most styling is handled via Tailwind.
********************/
</style> 