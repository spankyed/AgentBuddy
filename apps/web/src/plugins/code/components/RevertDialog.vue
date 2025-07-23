<template>
  <Teleport to="body">
    <div
      v-if="show"
      @click.self="onCancel"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
    >
      <div class="bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl w-96 overflow-hidden">
        <div class="p-4 border-b border-neutral-800">
          <h3 class="text-lg font-semibold text-neutral-100">Discard Changes</h3>
        </div>
        
        <div class="p-4">
          <p class="text-sm text-neutral-300 mb-4">
            Are you sure you want to discard all changes to:
          </p>
          <div class="bg-neutral-800 rounded px-3 py-2 mb-4 overflow-hidden">
            <code class="text-sm text-neutral-100 block truncate" dir="rtl">
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
            class="px-4 py-2 text-sm font-medium text-neutral-300 hover:text-neutral-100 hover:bg-neutral-800 rounded transition-colors"
          >
            Cancel
          </button>
          <button
            @click="onConfirm"
            class="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded transition-colors"
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
import type { GitStatusFile } from '../state'

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