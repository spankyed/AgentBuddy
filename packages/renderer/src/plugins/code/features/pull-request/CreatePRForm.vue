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
    <div>
      <label class="block text-xs text-neutral-400 mb-1">Description</label>
      <textarea
        :value="body"
        @input="$emit('update-field', 'body', ($event.target as HTMLTextAreaElement).value)"
        placeholder="Describe your changes..."
        class="min-h-[80px] max-h-[200px] w-full px-2 py-1.5 text-xs rounded bg-neutral-800 border border-neutral-700 text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-blue-600 resize-y"
      />
    </div>

    <!-- Base branch -->
    <div>
      <label class="block text-xs text-neutral-400 mb-1">Base branch</label>
      <select
        :value="baseBranch || defaultBaseBranch"
        @change="$emit('update-field', 'baseBranch', ($event.target as HTMLSelectElement).value)"
        class="w-full px-2 py-1.5 text-xs rounded bg-neutral-800 border border-neutral-700 text-neutral-200 focus:outline-none focus:border-blue-600 appearance-none cursor-pointer"
      >
        <option
          v-for="branch in branchOptions"
          :key="branch"
          :value="branch"
        >{{ branch }}</option>
      </select>
    </div>

    <!-- Actions -->
    <div class="flex items-center gap-2 pt-1">
      <button
        @click="$emit('submit')"
        :disabled="!title.trim() || isCreating"
        class="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Loader2 v-if="isCreating" :size="12" class="animate-spin" />
        <GitPullRequest v-else :size="12" />
        <span>Create PR</span>
      </button>
      <button
        @click="$emit('submit-draft')"
        :disabled="!title.trim() || isCreating"
        class="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs rounded border border-neutral-700 text-neutral-300 hover:bg-neutral-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <FileEdit :size="12" />
        <span>Draft</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { GitPullRequest, Loader2, FileEdit } from 'lucide-vue-next'

const props = defineProps<{
  title: string
  body: string
  baseBranch: string
  draft: boolean
  defaultBaseBranch: string
  branches: string[]
  isCreating: boolean
}>()

// Ensure defaultBaseBranch is always in the list, even if branches haven't loaded
const branchOptions = computed(() => {
  if (props.branches.length === 0 && props.defaultBaseBranch) {
    return [props.defaultBaseBranch]
  }
  if (props.defaultBaseBranch && !props.branches.includes(props.defaultBaseBranch)) {
    return [props.defaultBaseBranch, ...props.branches]
  }
  return props.branches
})

defineEmits<{
  'update-field': [field: string, value: any]
  'submit': []
  'submit-draft': []
}>()
</script>
