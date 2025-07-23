<template>
  <Dialog
    :model-value="modelValue"
    :title="`Rename ${itemType}`"
    :description="`Enter a new name for the ${itemType.toLowerCase()}.`"
    @update:model-value="$emit('update:modelValue', $event)"
    @cancel="$emit('cancel')"
  >
    <form id="rename-form" @submit.prevent="handleSubmit" class="flex flex-col gap-4">
      <input
        v-model="localName"
        type="text"
        class="w-full px-4 py-2 bg-[#0a0a0a] border border-[#262626] rounded-lg text-[#e0e0e0] text-sm outline-none transition-all duration-200 focus:border-primary-400 focus:shadow-[0_0_0_2px_rgba(59,130,246,0.1)]"
        :placeholder="`Enter ${itemType.toLowerCase()} name`"
        autofocus
        @keydown.esc="$emit('cancel')"
      />
    </form>
    
    <template #actions>
      <Button variant="secondary" @click="$emit('cancel')">
        Cancel
      </Button>
      <Button type="submit" form="rename-form" :disabled="!isValidName">
        Rename
      </Button>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import Dialog from '@/core/design/dialog.vue'
import Button from '@/core/design/button.vue'

interface Props {
  modelValue: boolean
  currentName: string
  itemType: 'File' | 'Directory'
  itemPath: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'cancel': []
  'rename': [newName: string]
}>()

const localName = ref('')

// Update local name when dialog opens or current name changes
watch(() => props.currentName, (newName) => {
  localName.value = newName || ''
}, { immediate: true })

// Reset name when dialog opens
watch(() => props.modelValue, (isOpen) => {
  if (isOpen) {
    localName.value = props.currentName || ''
  }
})

const isValidName = computed(() => {
  const trimmedName = localName.value.trim()
  // Check if name is not empty and different from current name
  return trimmedName.length > 0 && trimmedName !== props.currentName
})

function handleSubmit() {
  const trimmedName = localName.value.trim()
  if (isValidName.value) {
    emit('rename', trimmedName)
  }
}
</script>