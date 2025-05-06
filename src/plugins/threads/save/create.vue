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
        <label class="block mb-2 text-sm font-medium text-neutral-300">Context</label>
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
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const title = ref('Project X')
const status = ref('Active')
const threads = ref<string[]>(['USER-182', 'PROJ-13', 'AGENT-7'])

const addDetail = () => {
  threads.value.push('')
}
</script> 