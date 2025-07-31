<template>
  <Dialog
    :model-value="modelValue"
    title="Edit Flow Label"
    description="Update the label for the current flow."
    @update:model-value="$emit('update:modelValue', $event)"
    @cancel="$emit('cancel')"
  >
    <form id="label-form" @submit.prevent="handleSubmit" class="flex flex-col gap-4">
      <input
        v-model="localLabel"
        type="text"
        class="w-full px-4 py-2 bg-[#0a0a0a] border border-[#262626] rounded-lg text-[#e0e0e0] text-sm outline-none transition-all duration-200 focus:border-primary-400 focus:shadow-[0_0_0_2px_rgba(59,130,246,0.1)]"
        placeholder="Enter flow label"
        autofocus
      />
    </form>
    
    <template #actions>
      <Button variant="secondary" @click="$emit('cancel')">
        Cancel
      </Button>
      <Button type="submit" form="label-form">
        Save
      </Button>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import Dialog from '@/core/design/dialog.vue'
import Button from '@/core/design/button.vue'

interface Props {
  modelValue: boolean
  flowLabel?: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'cancel': []
  'save': [label: string]
}>()

const localLabel = ref('')

// Update local label when prop changes
watch(() => props.flowLabel, (newLabel) => {
  localLabel.value = newLabel || ''
}, { immediate: true })

function handleSubmit() {
  if (localLabel.value.trim()) {
    emit('save', localLabel.value.trim())
  }
}
</script> 