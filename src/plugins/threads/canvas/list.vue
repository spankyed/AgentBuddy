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
        class="flex items-center justify-between border rounded-md cursor-pointer bg-neutral-900 border-neutral-700"
      >
      
        <div class="flex items-center flex-1 h-full px-4 py-2 hover:bg-neutral-800" @click="actor.send({ type: 'SELECT_THREAD', id: thread.id })">
          <!-- ID badge and truncated title -->
          <div class="flex items-center flex-1 space-x-2">
            <span class="px-2 py-1 text-xs font-semibold text-neutral-500">
              {{ thread.id }}
            </span>
            <span class="text-sm text-white truncate hover:text-neutral-100">
              {{ thread.title || thread.id }}
            </span>
          </div>
          <!-- Status selector and tags -->
          <div class="flex items-center space-x-3" @click.stop>
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
          </div>
        </div>

        <button
          @click.stop="addDetail"
          type="button"
          class="flex items-center justify-center h-full px-4 py-2 text-neutral-500 hover:text-neutral-100 hover:bg-neutral-800"
        >
          Chat
          <Headset :size="16" class="ml-2"/>
        </button>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Headset, Search, Plus } from 'lucide-vue-next'
import { applicationActor } from '@/application'
import { useSelector, useActor } from '@xstate/vue'
import Button from '@/components/design/button.vue'
import { id } from '@/plugins/threads/state'

interface Thread {
  id: string
  title?: string
  status: string
  tags: string[]
}

const actor = applicationActor.system.get(id)

const searchKeyword = ref('')
const threads = ref<Thread[]>([
  { id: 'U-182', title: 'Use css variables from our design systems', status: 'queued', tags: ['backend'] },
  { id: 'P-13', title: 'Project X', status: 'active', tags: ['frontend', 'ui'] },
  { id: 'WI-7', title: 'Some work item for the agent', status: 'inactive', tags: ['agent'] },
])

const addDetail = () => {
  threads.value.push({ id: '', title: '', status: 'open', tags: [] })
}
</script>

<style lang="scss" module>
</style> 