<template>
  <div class="flex flex-col flex-1 overflow-y-auto p-3 gap-3">
    <!-- Unpublished branch warning -->
    <div
      v-if="!hasUpstream"
      class="flex items-center gap-2 p-2 rounded bg-yellow-900/20 border border-yellow-800/30"
    >
      <AlertTriangle :size="14" class="text-yellow-500 shrink-0" />
      <span class="text-xs text-yellow-400 flex-1">Branch is not published. Publish it before creating a PR.</span>
      <button
        @click="$emit('publish-branch')"
        :disabled="isPublishing"
        class="px-2 py-0.5 text-xs rounded bg-yellow-700/50 text-yellow-300 hover:bg-yellow-700 transition-colors disabled:opacity-50"
      >
        <Loader2 v-if="isPublishing" :size="12" class="animate-spin" />
        <span v-else>Publish</span>
      </button>
    </div>

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
        :disabled="!title.trim() || isCreating || !hasUpstream"
        class="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Loader2 v-if="isCreating" :size="12" class="animate-spin" />
        <GitPullRequest v-else :size="12" />
        <span>Create Pull Request</span>
      </button>
      <button
        @click="$emit('cancel')"
        class="px-3 py-1.5 text-xs rounded text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
      >
        Cancel
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { GitPullRequest, AlertTriangle, Loader2 } from 'lucide-vue-next'

defineProps<{
  title: string
  body: string
  baseBranch: string
  draft: boolean
  defaultBaseBranch: string
  hasUpstream: boolean
  isCreating: boolean
  isPublishing: boolean
}>()

defineEmits<{
  'update-field': [field: string, value: any]
  'submit': []
  'cancel': []
  'publish-branch': []
}>()
</script>
