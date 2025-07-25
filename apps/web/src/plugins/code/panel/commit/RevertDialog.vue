<template>
  <Teleport to="body">
    <div
      v-if="show"
      @click.self="onCancel"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    >
      <div class="overflow-hidden border rounded-lg shadow-xl bg-neutral-900 border-neutral-700 w-96">
        <div class="p-4 border-b border-neutral-800">
          <h3 class="text-lg font-semibold text-neutral-100">Discard Changes</h3>
        </div>
        
        <div class="p-4">
          <p class="mb-4 text-sm text-neutral-300">
            Are you sure you want to discard all changes to:
          </p>
          <div class="px-3 py-2 mb-4 overflow-hidden rounded bg-neutral-800">
            <code class="block text-sm truncate text-neutral-100" dir="rtl">
              <span dir="ltr">{{ file?.path }}</span>
            </code>
          </div>
          <p class="text-sm text-yellow-500">
            <AlertCircle class="inline w-4 h-4 mr-1" />
            This action cannot be undone.
          </p>
        </div>
        
        <div class="flex justify-end gap-2 p-4 border-t border-neutral-800">
          <button
            @click="onCancel"
            class="px-4 py-2 text-sm font-medium transition-colors rounded text-neutral-300 hover:text-neutral-100 hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            @click="onConfirm"
            class="px-4 py-2 text-sm font-medium text-white transition-colors bg-red-600 rounded hover:bg-red-700"
          >
            Discard Changes
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { AlertCircle } from 'lucide-vue-next'
import type { GitStatusFile } from '@/plugins/code/state'

defineProps<{
  show: boolean
  file: GitStatusFile | null
}>()

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

const onConfirm = () => {
  emit('confirm')
}

const onCancel = () => {
  emit('cancel')
}
</script>