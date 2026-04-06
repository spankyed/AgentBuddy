<template>
  <div class="flex flex-col flex-1 overflow-y-auto p-3 gap-3">
    <!-- Title -->
    <div>
      <label class="block text-xs text-neutral-400 mb-1">Title</label>
      <input
        :value="title"
        @input="$emit('update-field', 'title', ($event.target as HTMLInputElement).value)"
        placeholder="PR title"
        class="w-full px-2 py-1.5 text-xs rounded bg-neutral-800 border border-neutral-700 text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-blue-600"
      />
    </div>

    <!-- Body -->
    <div class="flex-1 flex flex-col min-h-0">
      <label class="block text-xs text-neutral-400 mb-1">Description</label>
      <textarea
        :value="body"
        @input="$emit('update-field', 'body', ($event.target as HTMLTextAreaElement).value)"
        placeholder="Describe your changes..."
        class="flex-1 min-h-[80px] w-full px-2 py-1.5 text-xs rounded bg-neutral-800 border border-neutral-700 text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-blue-600 resize-none"
      />
    </div>

    <!-- Base branch -->
    <div>
      <label class="block text-xs text-neutral-400 mb-1">Base branch</label>
      <input
        :value="baseBranch"
        @input="$emit('update-field', 'baseBranch', ($event.target as HTMLInputElement).value)"
        :placeholder="defaultBaseBranch || 'main'"
        class="w-full px-2 py-1.5 text-xs rounded bg-neutral-800 border border-neutral-700 text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-blue-600"
      />
    </div>

    <!-- Draft checkbox -->
    <label class="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        :checked="draft"
        @change="$emit('update-field', 'draft', ($event.target as HTMLInputElement).checked)"
        class="rounded border-neutral-600 bg-neutral-800 text-blue-600 focus:ring-blue-600 focus:ring-offset-0"
      />
      <span class="text-xs text-neutral-400">Create as draft</span>
    </label>

    <!-- Actions -->
    <div class="flex items-center gap-2 pt-1">
      <button
        @click="$emit('submit')"
        :disabled="!title.trim() || isCreating"
        class="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Loader2 v-if="isCreating" :size="12" class="animate-spin" />
        <GitPullRequest v-else :size="12" />
        <span>Create Pull Request</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { GitPullRequest, Loader2 } from 'lucide-vue-next'

defineProps<{
  title: string
  body: string
  baseBranch: string
  draft: boolean
  defaultBaseBranch: string
  isCreating: boolean
}>()

defineEmits<{
  'update-field': [field: string, value: any]
  'submit': []
}>()
</script>
