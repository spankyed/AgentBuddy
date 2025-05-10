<template>
  <div class="max-w-5xl px-6 py-4 mx-auto space-y-6">
    <!-- Search & Create row -->
    <div class="flex flex-col gap-4 md:flex-row md:items-center md:gap-6">
      <button
        @click="actor.send({ type: 'SHOW_CREATE_FORM' })"
        type="button"
        class="flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors rounded h-7 bg-primary-600 hover:bg-primary-500"
      >
        <Plus :size="16" class="" />
        New Thread
      </button>
      <div class="flex justify-end flex-1 gap-1 text-sm">
        <!-- <button type="button" class="text-primary-400 hover:underline">Advanced Search</button> -->
        <Button
          type="button"
          variant="transparent"
        >
          Clear filters
        </Button>
        <Button
          type="button"
          variant="transparent"
        >
          Filter
        </Button>
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
        :key="thread.id"
        class="flex items-center justify-between px-4 py-2 border rounded-lg cursor-pointer bg-neutral-900 border-neutral-700 hover:bg-neutral-800"
      >
        <!-- ID badge and truncated title -->
        <div class="flex items-center flex-1 space-x-2" @click="actor.send({ type: 'SELECT_THREAD', id: thread.id })">
          <span class="px-2 py-0.5 text-xs font-semibold text-white bg-blue-500 rounded hover:bg-blue-400">
            {{ thread.id }}
          </span>
          <span class="text-sm truncate text-neutral-200 hover:text-neutral-100">
            {{ thread.title || thread.id }}
          </span>
        </div>
        <!-- Status selector and tags -->
        <div class="flex items-center space-x-3">
          <select
            v-model="thread.status"
            class="px-2 py-0.5 text-xs rounded bg-neutral-700 text-neutral-200 focus:outline-none"
          >
            <option value="draft">Draft</option>
            <option value="queued">Queued</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <div class="flex space-x-1 overflow-hidden w-28 whitespace-nowrap">
            <span v-for="tag in thread.tags" :key="tag" class="px-2 py-1 text-xs text-purple-100 bg-purple-900 rounded-full">{{ tag }}</span>
          </div>
          <button
            @click.stop="addDetail"
            type="button"
            class="flex items-center justify-center p-2 rounded-full text-neutral-500 hover:text-neutral-400 hover:bg-neutral-900"
          >
            <Headset :size="16" />
          </button>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import Create from './create.vue'
import { Headset, ChevronRight, Search, Plus } from 'lucide-vue-next'
import { applicationActor } from '@/application'
import { useSelector, useActor } from '@xstate/vue'
import Button from '@/components/design/Button.vue'
import { id } from '@/plugins/threads/state'

// Silences unused import warnings for icon components (used in template)

// Get threads actor and state
const actor = applicationActor.system.get(id)
const showCreateForm = useSelector(actor, (snap: ThreadsSnapshot) => snap.context.showCreateForm)
// biome-ignore lint/suspicious/noExplicitAny: We cast unknown snapshot to expected context shape
const actions = useSelector(actor, (snapshot) => (snapshot as any).context.actions)

// Local state for form inputs
const searchKeyword = ref('')
const title = ref('Project X')
const status = ref('Active')

// Define Thread interface and initialize threads with status and tags
interface Thread {
  id: string
  title?: string
  status: string
  tags: string[]
}

const threads = ref<Thread[]>([
  { id: 'U-182', title: 'Use css variables from our design systems', status: 'queued', tags: ['backend'] },
  { id: 'P-13', title: 'Project X', status: 'active', tags: ['frontend', 'ui'] },
  { id: 'WI-7', title: 'Some work item for the agent', status: 'inactive', tags: ['agent'] },
])

const addDetail = () => {
  threads.value.push({ id: '', title: '', status: 'open', tags: [] })
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