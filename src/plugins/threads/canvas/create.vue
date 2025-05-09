<template>
  <div class="max-w-5xl px-6 py-4 mx-auto space-y-6">
    <div class="p-4 space-y-6 border rounded-lg bg-neutral-800 border-neutral-700">
      <!-- Title & Status -->
      <div class="flex flex-col gap-4 md:flex-row">
        <div class="flex-1">
          <label class="block mb-1 text-sm font-medium text-neutral-300">Title</label>
          <input
            v-model="title"
            type="text"
            :placeholder="placeholder"
            class="w-full px-3 py-2 text-sm border rounded bg-neutral-900 border-neutral-700 text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary-600"
          />
        </div>
        <div class="w-full md:w-40">
          <label class="block mb-1 text-sm font-medium text-neutral-300">Type</label>
          <select
            v-model="type"
            class="w-full px-3 py-2 text-sm border rounded bg-neutral-900 border-neutral-700 text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary-600"
          >
            <option value="work-item">Work Item</option>
            <option value="project">Project</option>
          </select>
        </div>
      </div>

      <!-- Context -->
      <div>
        <label class="block mb-2 text-sm font-medium text-neutral-300">Context</label>
        <div class="p-2 border rounded-lg bg-neutral-800 border-neutral-700">
          <p class="text-sm italic text-neutral-300">please use css variables from our design systems</p>
        </div>
      </div>

      <!-- Threads list -->
      <div>
        <label class="block mb-2 text-sm font-medium text-neutral-300">Related Threads</label>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            @click="addDetail"
            class="flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors rounded h-7 text-neutral-200 bg-neutral-700 hover:bg-neutral-600"
          >
            Link Thread
            <Plus size="16" class="text-neutral-500" />
          </button>

          <span
            v-for="(thread, index) in threads"
            :key="index"
            class="inline-flex items-center pl-3 py-0.5 text-sm bg-neutral-700 text-neutral-200 rounded"
          >
            {{ thread }}
            <button
              type="button"
              @click="removeThread(index)"
              class="p-1 ml-1 rounded focus:outline-none"
            >
              <X size="16" class="text-neutral-400 hover:text-neutral-200" />
            </button>
          </span>
        </div>
      </div>

      <div class="flex items-center justify-end gap-2">
        <!-- Stop button -->
        <button
          title="Cancel thread creation"
          type="submit"
          @click="actor.send({ type: 'CANCEL_CREATE' })"
          :class="[
            'px-4 py-2 h-7 rounded text-sm font-medium transition-colors flex items-center gap-2 hover:bg-neutral-700 text-neutral-500 hover:text-white',
          ]"
        >
          Cancel
          <Square :size="22" />
        </button>
        <button
          type="submit"
          @click="actor.send({ type: 'CREATE_THREAD' })"
          :disabled="!isSaving"
          :class="[
            'px-4 py-2 h-7 rounded text-sm font-medium transition-colors flex items-center gap-2',
            isSaving
              ? 'bg-primary-500 text-white hover:bg-primary-400 active:bg-primary-600' 
              : 'bg-primary-700 text-neutral-400'
          ]"
        >
          Create
          <CornerDownLeft class="-rotate-45" :size="16" />
        </button>
      </div>

      <div>
        <!-- <button
          type="button"
          @click="addDetail"
          class="px-3 py-1.5 text-sm font-medium text-white rounded bg-neutral-700 hover:bg-neutral-600"
        >
          + Add Detail
        </button> -->
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { X, Plus } from 'lucide-vue-next'
import { applicationActor } from '@/application'
import { useSelector } from '@xstate/vue'
import { id } from '@/plugins/threads/state.ts';

const actor = applicationActor.system.get(id);
// const someState = useSelector(actor, (state) => state.context.someState)

const title = ref('')
const type = ref('work-item')
// Placeholder options for title based on selected type
const workItemPlaceholders = [
  'Review latest PR for UX improvements',
  'Tackle sprint tasks for Q2',
  'Implement dev feedback for bug fixes'
]
const projectPlaceholders = [
  'Q3 marketing campaign',
  'Upcoming project milestones',
  'Settings page redesign',
]
const placeholder = ref('')
const setRandomPlaceholder = () => {
  const list = type.value === 'work-item'
    ? workItemPlaceholders
    : projectPlaceholders
  placeholder.value = list[Math.floor(Math.random() * list.length)]
}
onMounted(() => setRandomPlaceholder())
watch(type, () => setRandomPlaceholder())
const threads = ref<string[]>(['U-182', 'P-13', 'WI-7'])
const isSaving = ref('')

const addDetail = () => {
  threads.value.push('')
}

const removeThread = (index: number) => {
  threads.value.splice(index, 1)
}
</script> 