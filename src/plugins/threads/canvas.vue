<template>
  <div class="max-w-5xl px-6 py-4 mx-auto space-y-6">
    <!-- Search & Create row -->
    <div class="flex flex-col gap-4 md:flex-row md:items-center md:gap-6">
      <button
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
          class=" w-96 px-4 py-2 text-sm border rounded-tl rounded-bl bg-neutral-900 border-neutral-700 placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-primary-600"
        />
        <button
          type="button"
          class="px-4 py-2 text-sm font-medium text-white rounded-tr rounded-br bg-neutral-700 hover:bg-neutral-600"
        >
          <Search :size="16" class="text-neutral-500" />
        </button>
      </div>


    </div>

    <!-- Main form section -->
    <div class="p-4 space-y-6 border rounded-lg bg-neutral-800 border-neutral-700">
      <!-- Title & Status -->
      <div class="flex flex-col gap-4 md:flex-row">
        <div class="flex-1">
          <label class="block mb-1 text-sm font-medium text-neutral-300">Title</label>
          <input
            v-model="title"
            type="text"
            class="w-full px-3 py-2 text-sm border rounded bg-neutral-900 border-neutral-700 text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary-600"
          />
        </div>
        <div class="w-full md:w-40">
          <label class="block mb-1 text-sm font-medium text-neutral-300">Status</label>
          <select
            v-model="status"
            class="w-full px-3 py-2 text-sm border rounded bg-neutral-900 border-neutral-700 text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary-600"
          >
            <option value="Active">Active</option>
            <option value="Archived">Archived</option>
          </select>
        </div>
      </div>


      <!-- Context -->
      <div>
        <label class="block mb-2  text-sm font-medium text-neutral-300">Context</label>
        <div class="p-2 border rounded-lg bg-neutral-800 border-neutral-700">
          <p class="text-sm italic text-neutral-300">please rewrite this code using css variables from our design systems</p>
        </div>
      </div>

      <!-- Threads list -->
      <div>
        <label class="block mb-2 text-sm font-medium text-neutral-300">Related Threads</label>
        <div class="space-y-2">
          <input
            v-for="(thread, index) in threads"
            :key="index"
            v-model="threads[index]"
            type="text"
            class="w-full px-3 py-2 text-sm border rounded bg-neutral-900 border-neutral-700 text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary-600"
            placeholder="Thread"
          />

        </div>
      </div>

      <div>
        <button
          type="button"
          @click="addDetail"
          class="px-3 py-1.5 text-sm font-medium text-white rounded bg-neutral-700 hover:bg-neutral-600"
        >
          + Add Detail
        </button>
        <button
          type="button"
          @click="addDetail"
          class="px-3 py-1.5 ml-2 text-sm font-medium text-white rounded bg-neutral-700 hover:bg-neutral-600"
        >
          + Link Thread
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