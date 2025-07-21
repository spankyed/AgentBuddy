<template>
  <Dialog
    v-model="isOpen"
    title="File Modified Externally"
    :description="description"
    :show-default-actions="true"
    cancel-text="Cancel"
    confirm-text="Override External Changes"
    @confirm="handleOverride"
    @cancel="handleCancel"
  >
    <div class="space-y-4">
      <div class="p-3 bg-yellow-900/30 border border-yellow-800 rounded-lg">
        <div class="flex items-start gap-2">
          <AlertTriangle class="w-5 h-5 text-yellow-500 mt-0.5" />
          <div class="text-sm text-yellow-200">
            The file "{{ fileName }}" has been modified externally since you started editing it.
            Your changes may conflict with the external modifications.
          </div>
        </div>
      </div>
      
      <div class="space-y-2">
        <button
          @click="handleLoadExternal"
          class="w-full px-4 py-2 text-left rounded-lg border border-neutral-600 hover:bg-neutral-800 transition-colors"
        >
          <div class="font-medium text-neutral-200">Load External Changes</div>
          <div class="text-sm text-neutral-400">Replace your changes with the external version</div>
        </button>
        
        <button
          @click="handleShowDiff"
          class="w-full px-4 py-2 text-left rounded-lg border border-neutral-600 hover:bg-neutral-800 transition-colors"
        >
          <div class="font-medium text-neutral-200">View Differences</div>
          <div class="text-sm text-neutral-400">Compare your changes with the external version</div>
        </button>
      </div>
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { AlertTriangle } from 'lucide-vue-next'
import Dialog from '@/core/design/dialog.vue'

const props = defineProps<{
  modelValue: boolean
  filePath: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'override'): void
  (e: 'loadExternal'): void
  (e: 'showDiff'): void
  (e: 'cancel'): void
}>()

const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const fileName = computed(() => {
  return props.filePath.split('/').pop() || props.filePath
})

const description = computed(() => {
  return `Choose how to handle the conflict for ${fileName.value}`
})

function handleOverride() {
  emit('override')
  isOpen.value = false
}

function handleLoadExternal() {
  emit('loadExternal')
  isOpen.value = false
}

function handleShowDiff() {
  emit('showDiff')
  isOpen.value = false
}

function handleCancel() {
  emit('cancel')
  isOpen.value = false
}
</script>